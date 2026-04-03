const express = require('express');
const { triggerVoiceAlert, getAvailableMessages, generateCustomVoice } = require('../controllers/voiceController');
const { protect } = require('../middleware/authMiddleware');
const { requireRole } = require('../middleware/roleMiddleware');

const router = express.Router();

router.post('/alert', protect, requireRole('admin', 'police'), triggerVoiceAlert);
router.post('/generate', protect, requireRole('admin', 'police'), generateCustomVoice);
router.get('/messages', getAvailableMessages); // public — list available Hindi messages

module.exports = router;
