const express = require('express');
const { getPrediction, detectCrowd } = require('../controllers/predictionController');
const { protect } = require('../middleware/authMiddleware');
const { requireRole } = require('../middleware/roleMiddleware');

const router = express.Router();

// 7.2 Get Crowd Prediction
router.get('/crowd', getPrediction);

// CCTV/Internal Detection Hook
router.post('/detect', protect, requireRole('admin', 'police'), detectCrowd);

module.exports = router;
