const axios = require('axios');
const { emitAlert, emitRouteUpdate } = require('../services/socketService');
const { generateHindiVoiceAlert, broadcastVoiceAlert } = require('../services/voiceService');
const { autoAssignVolunteer } = require('../services/assignmentService');
const { broadcastEmergency } = require('../services/notificationService');
const { getSafeRoute } = require('../services/geoService');
const logger = require('../utils/logger');
const admin = require('firebase-admin');

const STAMPEDE_THRESHOLD = parseFloat(process.env.STAMPEDE_RISK_THRESHOLD) || 0.75;

/**
 * POST /api/collision/check
 * Receives crowd risk data from ML service or CCTV system.
 * Triggers full stampede protocol if risk exceeds threshold.
 */
/**
 * Private helper to trigger the full emergency response for a zone.
 * Shared by both AI detection and manual testing hooks.
 */
const executeEmergencyProtocol = async (zoneUpper, risk, source, coordinates = null) => {
  const responseActions = [];
  
  logger.warn(`🚨 STAMPEDE PROTOCOL ACTIVATED: Zone ${zoneUpper} | Risk Score: ${risk}`);

  // 1. Generate Voice Alert
  const voiceResult = await generateHindiVoiceAlert('stampede');
  
  // 2. Create Persistent Alert Record
  const alertData = {
    type: 'stampede',
    message: `Stampede risk detected in Zone ${zoneUpper}. Risk score: ${(risk * 100).toFixed(0)}%. Immediate evacuation required.`,
    messageHindi: voiceResult.message,
    zone: zoneUpper,
    severity: 5,
    triggeredBySource: source,
    voiceAlertUrl: voiceResult.audioUrl,
    isActive: true,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  };

  const alertRef = await global.db.collection('alerts').add(alertData);
  responseActions.push('alert_created');

  // 3. Broadcast Voice Alert
  if (voiceResult.success) {
    broadcastVoiceAlert('stampede', voiceResult.audioUrl, voiceResult.message);
    responseActions.push('voice_alert_broadcast');
  }

  // 4. Send Mobile/Dashboard Emergency Broadcasts
  broadcastEmergency({
    alertId: alertRef.id,
    type: 'stampede',
    zone: zoneUpper,
    severity: 5,
    riskScore: risk,
    message: alertData.message,
    voiceAlertUrl: voiceResult.audioUrl,
  });
  responseActions.push('emergency_broadcast');

  // 5. Compute Safe Routes for Evacuation
  const snapshot = await global.db.collection('live_crowd_zones').get();
  const densityMap = {};
  snapshot.forEach(doc => {
    densityMap[doc.id] = doc.data().density;
  });
  densityMap[zoneUpper] = 100; // Mark epicenter as blocked

  const evacuationTargets = ['ZONE_J', 'ZONE_I', 'ZONE_G']; // Primary safe zones
  const safeRoutes = [];
  for (const target of evacuationTargets) {
    if (target !== zoneUpper) {
      try {
        const route = getSafeRoute(zoneUpper, target, densityMap);
        if (route.path.length > 0) safeRoutes.push(route);
      } catch (_) {}
    }
  }

  if (safeRoutes.length > 0) {
    await alertRef.update({ safeRoutes: safeRoutes.map(r => r.path) });
    emitRouteUpdate('zone', {
      targetRoom: `zone:${zoneUpper}`,
      routes: safeRoutes,
      message: `EVACUATE Zone ${zoneUpper}. Follow the safe route displayed on maps.`,
    });
    responseActions.push('safe_routes_computed');
  }

  // 6. Auto-Assign Emergency Volunteer
  const epicenterCoords = coordinates ? [coordinates.longitude, coordinates.latitude] : null;
  const volunteer = await autoAssignVolunteer(zoneUpper, 'emergency_handling', alertRef.id, 'Alert', epicenterCoords);
  if (volunteer) {
    responseActions.push('volunteer_assigned');
  }

  return { actions: responseActions, alertId: alertRef.id, safeRoutes };
};

/**
 * POST /api/collision/check
 * Receives crowd risk data from ML service or CCTV system.
 */
const checkCollision = async (req, res) => {
  try {
    const { zone, riskScore, coordinates, source = 'ml' } = req.body;

    if (!zone || riskScore === undefined) {
      return res.status(400).json({ success: false, message: 'zone and riskScore are required.' });
    }

    const zoneUpper = zone.toUpperCase();
    const risk = parseFloat(riskScore);
    const response = { zone: zoneUpper, riskScore: risk, threshold: STAMPEDE_THRESHOLD, stampedeTrigger: false, actions: [] };

    if (risk >= STAMPEDE_THRESHOLD) {
      response.stampedeTrigger = true;
      const result = await executeEmergencyProtocol(zoneUpper, risk, source, coordinates);
      response.actions = result.actions;
      response.safeRoutes = result.safeRoutes;
    } else if (risk >= 0.5) {
      emitAlert({
        type: 'overcrowding',
        zone: zoneUpper,
        severity: 3,
        riskScore: risk,
        message: `Elevated crowd risk in Zone ${zoneUpper}. Risk: ${(risk * 100).toFixed(0)}%`,
      });
      response.actions.push('warning_broadcast');
    }

    res.status(200).json({ success: true, ...response });
  } catch (err) {
    logger.error(`checkCollision error: ${err.message}`);
    res.status(500).json({ success: false, message: 'Internal server error.' });
  }
};

/**
 * POST /api/collision/stampede-protocol (Admin Only)
 * Testing hook to manually trigger and verify emergency systems.
 */
const testStampedeProtocol = async (req, res) => {
  try {
    const { currentCrowd } = req.body;

    if (!currentCrowd || !Array.isArray(currentCrowd)) {
      return res.status(400).json({ success: false, message: 'currentCrowd array is required for testing.' });
    }

    const testResults = [];

    for (const item of currentCrowd) {
      const { zone, headCount, capacity } = item;
      const risk = headCount / capacity;
      const zoneUpper = zone.toUpperCase();

      if (risk >= STAMPEDE_THRESHOLD) {
        const result = await executeEmergencyProtocol(zoneUpper, risk, 'manual_test');
        testResults.push({ zone: zoneUpper, status: 'TRIPPED', ...result });
      } else {
        testResults.push({ zone: zoneUpper, status: 'SAFE', riskScore: risk });
      }
    }

    res.status(200).json({ success: true, message: 'Stampede protocol test complete.', results: testResults });
  } catch (err) {
    logger.error(`testStampedeProtocol error: ${err.message}`);
    res.status(500).json({ success: false, message: 'Internal server error.' });
  }
};

const getRiskAssessment = async (req, res) => {
  try {
    const { zone } = req.query;
    const mlUrl = `${process.env.ML_SERVICE_URL}/check-collision`;

    let mlResponse;
    try {
      const { data } = await axios.post(mlUrl, { zone }, { timeout: 5000 });
      mlResponse = data;
    } catch {
      mlResponse = {
        zone: zone?.toUpperCase() || 'UNKNOWN',
        riskScore: 0.1,
        confidence: 0.9,
        note: 'ML service unavailable. Mock data returned.',
        mock: true,
      };
    }

    res.status(200).json({ success: true, assessment: mlResponse });
  } catch (err) {
    logger.error(`getRiskAssessment error: ${err.message}`);
    res.status(500).json({ success: false, message: 'Internal server error.' });
  }
};

module.exports = { checkCollision, getRiskAssessment, testStampedeProtocol };
