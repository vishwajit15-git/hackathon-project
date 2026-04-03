const axios = require('axios');
const logger = require('../utils/logger');

/**
 * GET /api/prediction  (admin)
 * Fetches 30-minute crowd flow prediction from ML service.
 * Falls back to a statistical mock if ML is unavailable.
 */
const getPrediction = async (req, res) => {
  try {
    const { zone } = req.query;

    // Gather current crowd data to send to ML service
    let snapshot;
    if (zone) {
      const doc = await global.db.collection('live_crowd_zones').doc(zone.toUpperCase()).get();
      snapshot = doc.exists ? [doc] : [];
    } else {
      const result = await global.db.collection('live_crowd_zones').get();
      snapshot = result.docs;
    }

    const currentCrowd = snapshot.map(doc => {
      const data = doc.data();
      return { _id: doc.id, density: data.density, currentCount: data.currentCount, totalCapacity: data.totalCapacity };
    });

    let prediction;
    try {
      const { data } = await axios.post(
        `${process.env.ML_SERVICE_URL}/predict`,
        { zones: currentCrowd, horizonMinutes: 30 },
        { timeout: 2500 }
      );
      prediction = data;
    } catch {
      // ML unavailable — return mock statistical prediction
      logger.warn('ML /predict unavailable. Returning mock prediction.');
      prediction = generateMockPrediction(currentCrowd);
    }

    res.status(200).json({
      success: true,
      horizon: '30 minutes',
      generatedAt: new Date().toISOString(),
      prediction,
    });
  } catch (err) {
    logger.error(`getPrediction error: ${err.message}`);
    res.status(500).json({ success: false, message: 'Internal server error.' });
  }
};

/**
 * GET /api/prediction/detect  (admin)
 * Forward CCTV frame data to ML detect-crowd endpoint.
 */
const detectCrowd = async (req, res) => {
  try {
    const { imageBase64, zone } = req.body;

    let detectionResult;
    try {
      const { data } = await axios.post(
        `${process.env.ML_SERVICE_URL}/detect-crowd`,
        { imageBase64, zone },
        { timeout: 10000 }
      );
      detectionResult = data;
    } catch {
      detectionResult = {
        zone: zone?.toUpperCase(),
        detectedCount: Math.floor(Math.random() * 500 + 100),
        confidence: 0.85,
        anomalyDetected: false,
        mock: true,
        note: 'ML detect-crowd service unavailable.',
      };
    }

    res.status(200).json({ success: true, detection: detectionResult });
  } catch (err) {
    logger.error(`detectCrowd error: ${err.message}`);
    res.status(500).json({ success: false, message: 'Internal server error.' });
  }
};

/**
 * Generate a mock 30-min prediction using simple linear extrapolation.
 */
const generateMockPrediction = (currentCrowd) => {
  const timePoints = [5, 10, 15, 20, 25, 30];
  return {
    mock: true,
    note: 'Statistical mock prediction. Connect ML service for real predictions.',
    zones: currentCrowd.map(({ _id, density, currentCount, totalCapacity }) => ({
      zone: _id,
      currentDensity: density,
      forecast: timePoints.map((t) => {
        // Simple model: density tends toward 75% over time with ±10% noise
        const trend = density + (75 - density) * (t / 30);
        const noise = (Math.random() - 0.5) * 10;
        const predicted = Math.max(0, Math.min(100, trend + noise));
        return {
          minutesFromNow: t,
          predictedDensity: Math.round(predicted),
          predictedCount: Math.round((predicted / 100) * totalCapacity),
          riskLevel: predicted >= 95 ? 'critical' : predicted >= 85 ? 'high' : predicted >= 65 ? 'medium' : 'low',
        };
      }),
    })),
  };
};

module.exports = { getPrediction, detectCrowd };
