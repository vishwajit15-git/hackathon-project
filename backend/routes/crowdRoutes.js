const express = require('express');
const { updateCrowd, getCrowdStatus, getCrowdHistory } = require('../controllers/crowdController');
const { protect } = require('../middleware/authMiddleware');
const { requireRole } = require('../middleware/roleMiddleware');
const { requireApiKey } = require('../middleware/apiKeyMiddleware');

const router = express.Router();

// Allow ML model to update using ML_API_KEY, or fall back to JWT for authorized users
router.post('/update', (req, res, next) => {
  if (req.headers['x-api-key']) {
    return requireApiKey('ML_API_KEY')(req, res, next);
  }
  protect(req, res, () => requireRole('admin', 'police', 'medical')(req, res, next));
}, updateCrowd);
router.get('/status', getCrowdStatus); // public
router.get('/history/:zone', protect, requireRole('admin'), getCrowdHistory);

module.exports = router;
