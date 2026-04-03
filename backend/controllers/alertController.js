const { emitAlert } = require('../services/socketService');
const { notifyRoles } = require('../services/notificationService');
const { generateHindiVoiceAlert, broadcastVoiceAlert } = require('../services/voiceService');
const logger = require('../utils/logger');
const admin = require('firebase-admin');

// POST /api/alerts/create  (admin, police, medical)
const createAlert = async (req, res) => {
  try {
    const { type, message, messageHindi, zone, affectedZones, severity } = req.body;

    const voiceResult = await generateHindiVoiceAlert(type, messageHindi);

    const alertData = {
      type,
      message,
      messageHindi: voiceResult.message,
      zone: zone?.toUpperCase() || null,
      affectedZones: (affectedZones || []).map((z) => z.toUpperCase()),
      severity: parseInt(severity) || 1,
      triggeredBy: {
        uid: req.user.uid,
        name: req.user.name || 'System',
        role: req.user.role || 'admin',
      },
      triggeredBySource: 'manual',
      voiceAlertUrl: voiceResult.audioUrl || null,
      isActive: true,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    const docRef = await global.db.collection('alerts').add(alertData);
    const alertId = docRef.id;

    // Real-time broadcast
    emitAlert({ alertId, type, zone, severity, message, voiceAlertUrl: voiceResult.audioUrl });

    // Voice broadcast
    if (voiceResult.success) {
      broadcastVoiceAlert(type, voiceResult.audioUrl, voiceResult.message);
    }

    // Notify staff roles
    notifyRoles(['police', 'medical', 'admin'], 'alert:new', {
      alertId,
      type,
      zone,
      severity,
      message,
    });

    logger.info(`Alert created: ${type} | Zone: ${zone} | Severity: ${severity}`);
    res.status(201).json({ success: true, message: 'Alert created and broadcasted.', alert: { _id: alertId, ...alertData } });
  } catch (err) {
    logger.error(`createAlert error: ${err.message}`);
    res.status(500).json({ success: false, message: 'Internal server error.' });
  }
};

// GET /api/alerts/active  (public)
const getActiveAlerts = async (req, res) => {
  try {
    const { zone, type, minSeverity } = req.query;
    
    let query = global.db.collection('alerts').where('isActive', '==', true);
    
    if (zone) query = query.where('zone', '==', zone.toUpperCase());
    if (type) query = query.where('type', '==', type);
    if (minSeverity) query = query.where('severity', '>=', parseInt(minSeverity));

    const snapshot = await query.get();
    const alerts = snapshot.docs.map(doc => ({ _id: doc.id, id: doc.id, ...doc.data() }));

    // Sort in memory to avoid index requirements
    alerts.sort((a, b) => {
      if (b.severity !== a.severity) return b.severity - a.severity;
      return (b.createdAt?.toDate() || 0) - (a.createdAt?.toDate() || 0);
    });

    res.status(200).json({ success: true, count: alerts.length, alerts });
  } catch (err) {
    logger.error(`getActiveAlerts error: ${err.message}`);
    res.status(500).json({ success: false, message: 'Internal server error.' });
  }
};

// PATCH /api/alerts/:id/resolve  (admin)
const resolveAlert = async (req, res) => {
  try {
    const alertRef = global.db.collection('alerts').doc(req.params.id);
    const doc = await alertRef.get();
    
    if (!doc.exists) return res.status(404).json({ success: false, message: 'Alert not found.' });
    if (!doc.data().isActive) return res.status(400).json({ success: false, message: 'Alert already resolved.' });

    await alertRef.update({
      isActive: false,
      resolvedAt: admin.firestore.FieldValue.serverTimestamp(),
      resolvedBy: {
        uid: req.user.uid,
        name: req.user.name,
      }
    });

    // Notify all that alert is resolved
    const alertData = doc.data();
    emitAlert({ alertId: doc.id, type: 'resolution', zone: alertData.zone, message: `Alert ${alertData.type} in ${alertData.zone} has been resolved.` });

    logger.info(`Alert resolved: ${doc.id} by ${req.user.uid}`);
    res.status(200).json({ success: true, message: 'Alert resolved.', alert: { _id: doc.id, ...alertData, isActive: false } });
  } catch (err) {
    logger.error(`resolveAlert error: ${err.message}`);
    res.status(500).json({ success: false, message: 'Internal server error.' });
  }
};

// GET /api/alerts/history  (admin)
const getAlertHistory = async (req, res) => {
  try {
    const { limit = 100 } = req.query;
    
    // Note: To truly support pagination in Firestore properly, we must use cursor patterns (startAfter),
    // but without frontend modifications, we will just cap the history pull to `limit` as offset skip is unsupported.
    const snapshot = await global.db.collection('alerts')
      .orderBy('createdAt', 'desc')
      .limit(parseInt(limit))
      .get();

    const alerts = snapshot.docs.map(doc => ({ _id: doc.id, id: doc.id, ...doc.data() }));

    // Count is expensive in Firestore, omitted for this stub
    res.status(200).json({ success: true, count: alerts.length, page: 1, alerts });
  } catch (err) {
    logger.error(`getAlertHistory error: ${err.message}`);
    res.status(500).json({ success: false, message: 'Internal server error.' });
  }
};

module.exports = { createAlert, getActiveAlerts, resolveAlert, getAlertHistory };
