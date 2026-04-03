const express = require('express');
const { updateCrowd, getCrowdStatus, getCrowdHistory } = require('../controllers/crowdController');
const { protect } = require('../middleware/authMiddleware');
const { requireRole } = require('../middleware/roleMiddleware');

const router = express.Router();

router.post('/update', protect, requireRole('admin', 'police', 'medical'), updateCrowd);
router.get('/status', getCrowdStatus); // public
router.get('/history/:zone', protect, requireRole('admin'), getCrowdHistory);

module.exports = router;
