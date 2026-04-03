const express = require('express');
const { updateCrowd, getCrowdStatus, getCrowdHistory } = require('../controllers/crowdController');
const { protect } = require('../middleware/authMiddleware');
const { requireRole } = require('../middleware/roleMiddleware');

const router = express.Router();

// Allow ML model to update without JWT if secret is present
router.post('/update', (req, res, next) => {
  if (req.headers['x-api-key'] === 'ml-crowd-secret') {
    return next();
  }
  protect(req, res, () => requireRole('admin', 'police', 'medical')(req, res, next));
}, updateCrowd);
router.get('/status', getCrowdStatus); // public
router.get('/history/:zone', protect, requireRole('admin'), getCrowdHistory);

module.exports = router;
