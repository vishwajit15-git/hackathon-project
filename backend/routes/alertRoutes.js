const express = require('express');
const { createAlert, getActiveAlerts, resolveAlert, getAlertHistory } = require('../controllers/alertController');
const { protect } = require('../middleware/authMiddleware');
const { requireRole } = require('../middleware/roleMiddleware');

const router = express.Router();

router.post('/', protect, requireRole('admin', 'police', 'medical'), createAlert);
router.get('/active', getActiveAlerts); // public
router.post('/:id/resolve', protect, requireRole('admin'), resolveAlert);
router.get('/history', protect, requireRole('admin'), getAlertHistory);

module.exports = router;
