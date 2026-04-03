const { emitCrowdUpdate } = require('../services/socketService');
const logger = require('../utils/logger');
const admin = require('firebase-admin');

// Helper to compute risk and density dynamically
const computeCrowdMetrics = (currentCount, totalCapacity) => {
  const density = Math.min(100, Math.round((currentCount / totalCapacity) * 100));

  const HIGH = parseInt(process.env.CROWD_HIGH_DENSITY_PERCENT) || 85;
  const MED = parseInt(process.env.CROWD_MEDIUM_DENSITY_PERCENT) || 65;

  let riskLevel = 'low';
  if (density >= 95) riskLevel = 'critical';
  else if (density >= HIGH) riskLevel = 'high';
  else if (density >= MED) riskLevel = 'medium';

  const overCapacity = Math.max(0, density - 50);
  const estimatedWaitMinutes = Math.round((overCapacity / 10) * 5);

  return { density, riskLevel, estimatedWaitMinutes };
};

// POST /api/crowd/update  (admin, police, sensor)
const updateCrowd = async (req, res) => {
  try {
    const { zone, currentCount, totalCapacity, source } = req.body;

    if (!zone || currentCount === undefined || !totalCapacity) {
      return res.status(400).json({ success: false, message: 'zone, currentCount, totalCapacity are required.' });
    }

    const { density, riskLevel, estimatedWaitMinutes } = computeCrowdMetrics(currentCount, totalCapacity);

    const crowdData = {
      zone: zone.toUpperCase(),
      currentCount,
      totalCapacity,
      density,
      riskLevel,
      estimatedWaitMinutes,
      source: source || 'manual',
      updatedBy: req.user?.uid || 'system',
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
    };

    const batch = global.db.batch();
    
    // 1. Update the live zone state (always 1 document per zone)
    const liveRef = global.db.collection('live_crowd_zones').doc(zone.toUpperCase());
    batch.set(liveRef, crowdData);

    // 2. Append to history collection for ML
    const historyRef = global.db.collection('crowd_history').doc();
    batch.set(historyRef, crowdData);

    await batch.commit();

    // Emit real-time update
    emitCrowdUpdate(zone, {
      currentCount,
      totalCapacity,
      density,
      riskLevel,
      estimatedWaitMinutes,
    });

    logger.info(`Crowd updated: Zone ${zone.toUpperCase()} | ${currentCount}/${totalCapacity} | Risk: ${riskLevel}`);
    res.status(200).json({
      success: true,
      message: 'Crowd data updated.',
      crowd: crowdData,
    });
  } catch (err) {
    logger.error(`updateCrowd error: ${err.message}`);
    res.status(500).json({ success: false, message: 'Internal server error.' });
  }
};

// GET /api/crowd/status  (public)
const getCrowdStatus = async (req, res) => {
  try {
    const { zone } = req.query;

    let snapshot;
    if (zone) {
      const doc = await global.db.collection('live_crowd_zones').doc(zone.toUpperCase()).get();
      snapshot = doc.exists ? [doc] : [];
    } else {
      const result = await global.db.collection('live_crowd_zones').get();
      snapshot = result.docs;
    }

    const status = snapshot.map(doc => {
      const data = doc.data();
      return {
        _id: doc.id,
        currentCount: data.currentCount,
        totalCapacity: data.totalCapacity,
        density: data.density,
        riskLevel: data.riskLevel,
        estimatedWaitMinutes: data.estimatedWaitMinutes,
        source: data.source,
        lastUpdated: data.timestamp ? data.timestamp.toDate() : new Date(),
      };
    });

    // Sort by riskLevel manually since it's an enum (critical > high > medium > low)
    const riskWeight = { critical: 4, high: 3, medium: 2, low: 1 };
    status.sort((a, b) => riskWeight[b.riskLevel] - riskWeight[a.riskLevel]);

    const summary = {
      totalZones: status.length,
      criticalZones: status.filter((z) => z.riskLevel === 'critical').length,
      highRiskZones: status.filter((z) => z.riskLevel === 'high').length,
      overallStatus: status.some((z) => z.riskLevel === 'critical')
        ? 'CRITICAL'
        : status.some((z) => z.riskLevel === 'high')
        ? 'HIGH'
        : 'NORMAL',
    };

    res.status(200).json({ success: true, summary, zones: status });
  } catch (err) {
    logger.error(`getCrowdStatus error: ${err.message}`);
    res.status(500).json({ success: false, message: 'Internal server error.' });
  }
};

// GET /api/crowd/history/:zone  (admin)
const getCrowdHistory = async (req, res) => {
  try {
    const { zone } = req.params;
    const { limit = 50 } = req.query;
    
    const snapshot = await global.db.collection('crowd_history')
      .where('zone', '==', zone.toUpperCase())
      .limit(parseInt(limit))
      .get();
      
    const history = snapshot.docs.map(doc => ({ _id: doc.id, id: doc.id, ...doc.data() }));
    
    // Sort in memory to avoid index requirements
    history.sort((a, b) => (b.timestamp?.toDate() || 0) - (a.timestamp?.toDate() || 0));
    
    res.status(200).json({ success: true, zone: zone.toUpperCase(), count: history.length, history });
  } catch (err) {
    logger.error(`getCrowdHistory error: ${err.message}`);
    res.status(500).json({ success: false, message: 'Internal server error.' });
  }
};

module.exports = { updateCrowd, getCrowdStatus, getCrowdHistory };
