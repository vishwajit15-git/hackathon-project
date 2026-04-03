const { generateHindiVoiceAlert, broadcastVoiceAlert, HINDI_MESSAGES } = require('../services/voiceService');
const { getIO } = require('../services/socketService');
const logger = require('../utils/logger');

// POST /api/voice/alert  (admin, police)
const triggerVoiceAlert = async (req, res) => {
  try {
    const { alertType, customMessage, targetZone } = req.body;

    if (!alertType || !Object.keys(HINDI_MESSAGES).includes(alertType)) {
      return res.status(400).json({
        success: false,
        message: `Invalid alert type. Valid types: ${Object.keys(HINDI_MESSAGES).join(', ')}`,
      });
    }

    const voiceResult = await generateHindiVoiceAlert(alertType, customMessage);

    if (!voiceResult.success) {
      return res.status(500).json({
        success: false,
        message: 'Failed to generate voice alert.',
        error: voiceResult.error,
      });
    }

    // Broadcast via socket
    if (targetZone) {
      getIO().to(`zone:${targetZone.toUpperCase()}`).emit('alert:voice', {
        alertType,
        audioUrl: voiceResult.audioUrl,
        message: voiceResult.message,
        zone: targetZone.toUpperCase(),
        timestamp: new Date().toISOString(),
      });
    } else {
      broadcastVoiceAlert(alertType, voiceResult.audioUrl, voiceResult.message);
    }

    logger.info(`Voice alert triggered: ${alertType} | Zone: ${targetZone || 'ALL'}`);
    res.status(200).json({
      success: true,
      message: 'Voice alert triggered.',
      alertType,
      targetZone: targetZone?.toUpperCase() || 'ALL',
      audioUrl: voiceResult.audioUrl,
      hindiMessage: voiceResult.message,
    });
  } catch (err) {
    logger.error(`triggerVoiceAlert error: ${err.message}`);
    res.status(500).json({ success: false, message: 'Internal server error.' });
  }
};

// POST /api/voice/generate  (admin, police)
const generateCustomVoice = async (req, res) => {
  try {
    const { text, language = 'hi-IN' } = req.body;

    if (!text) {
      return res.status(400).json({ success: false, message: 'Text is required for voice generation.' });
    }

    const { generateVoiceURL, broadcastVoiceAlert } = require('../services/voiceService');
    const audioUrl = generateVoiceURL(text, language);

    // Broadcast to all clients
    broadcastVoiceAlert('custom', audioUrl, text);

    logger.info(`Custom voice alert generated: ${text.substring(0, 30)}...`);
    res.status(200).json({
      success: true,
      message: 'Custom voice alert generated and broadcasted.',
      audioUrl,
      text,
      language,
    });
  } catch (err) {
    logger.error(`generateCustomVoice error: ${err.message}`);
    res.status(500).json({ success: false, message: 'Internal server error.' });
  }
};
// GET /api/voice/messages  (public)
const getAvailableMessages = (req, res) => {
  const { HINDI_MESSAGES } = require('../services/voiceService');
  const messages = Object.entries(HINDI_MESSAGES).map(([type, hindi]) => ({ type, hindi }));
  res.status(200).json({ success: true, messages });
};

module.exports = { triggerVoiceAlert, getAvailableMessages, generateCustomVoice };
