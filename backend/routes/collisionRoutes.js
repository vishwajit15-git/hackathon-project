const express = require('express');
const { checkCollision, getRiskAssessment, testStampedeProtocol } = require('../controllers/collisionController');
const { protect } = require('../middleware/authMiddleware');
const { requireRole } = require('../middleware/roleMiddleware');

const router = express.Router();

// Primary endpoint — called by ML service or CCTV system
// In production, secure with ML-specific API key middleware
router.post('/check', checkCollision);

// Query current risk from ML service
router.get('/risk', protect, requireRole('admin', 'police'), getRiskAssessment);

// Testing hook for manual stampede protocol verification (Admin only)
router.post('/stampede-protocol', protect, requireRole('admin'), testStampedeProtocol);

module.exports = router;
