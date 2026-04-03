const axios = require('axios');
const logger = require('../utils/logger');

const GOOGLE_TTS_BASE = 'https://translate.google.com/translate_tts';

// Pre-defined Hindi alert messages for common emergency types
const HINDI_MESSAGES = {
  stampede: 'खतरा! भगदड़ का खतरा है। कृपया तुरंत पास के सुरक्षित मार्ग से निकलें। शांत रहें। घबराएं नहीं।',
  fire: 'आग! आग! कृपया तुरंत क्षेत्र खाली करें। अग्निशमन दल रास्ते में है।',
  medical: 'चिकित्सा आपातकाल। कृपया चिकित्सा दल को रास्ता दें।',
  evacuation: 'सभी यात्रियों को सूचित किया जाता है। कृपया तुरंत निकासी मार्ग का पालन करें।',
  overcrowding: 'क्षेत्र में भीड़ बहुत अधिक है। कृपया वैकल्पिक मार्ग का उपयोग करें।',
  general: 'ध्यान दें! कृपया सुरक्षा निर्देशों का पालन करें।',
};

/**
 * Get predefined Hindi message for an alert type.
 */
const getHindiMessage = (alertType, customMessage = null) => {
  if (customMessage) return customMessage;
  return HINDI_MESSAGES[alertType] || HINDI_MESSAGES.general;
};

/**
 * Generate Hindi voice alert using Google Translate TTS (free, no API key).
 * Returns: { audioUrl, message, success }
 *
 * NOTE: For production, replace with Google Cloud TTS (paid) for reliability.
 * Free endpoint: https://translate.google.com/translate_tts?ie=UTF-8&q=TEXT&tl=hi&client=tw-ob
 */
const generateHindiVoiceAlert = async (alertType, customMessage = null) => {
  try {
    const message = getHindiMessage(alertType, customMessage);
    const encodedMessage = encodeURIComponent(message);

    // Google Translate TTS endpoint
    const audioUrl = `${GOOGLE_TTS_BASE}?ie=UTF-8&q=${encodedMessage}&tl=hi&client=tw-ob&total=1&idx=0&textlen=${message.length}`;

    // Verify the URL is accessible (HEAD request)
    try {
      await axios.head(audioUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        timeout: 5000,
      });
    } catch {
      // Google TTS might reject HEAD; URL is still valid for GET
      logger.debug('TTS HEAD check failed, URL may still be valid for playback');
    }

    logger.info(`Hindi voice alert generated: ${alertType}`);

    return {
      success: true,
      audioUrl,
      message,
      alertType,
      generatedAt: new Date().toISOString(),
    };

  } catch (err) {
    logger.error(`generateHindiVoiceAlert error: ${err.message}`);
    return {
      success: false,
      audioUrl: null,
      message: getHindiMessage(alertType, customMessage),
      error: err.message,
    };
  }
};

/**
 * Broadcast voice alert via Socket.io to all connected clients.
 * Clients can play the audio URL in their browser.
 */
const broadcastVoiceAlert = (alertType, audioUrl, message) => {
  try {
    const { getIO } = require('./socketService');
    getIO().emit('alert:voice', {
      alertType,
      audioUrl,
      message,
      timestamp: new Date().toISOString(),
    });
    logger.info(`Voice alert broadcasted: ${alertType}`);
  } catch (err) {
    logger.error(`broadcastVoiceAlert error: ${err.message}`);
  }
};

const generateVoiceURL = (text, language = 'hi-IN') => {
  const langCode = language.split('-')[0]; // Extract 'hi' from 'hi-IN'
  const encodedText = encodeURIComponent(text);
  return `${GOOGLE_TTS_BASE}?ie=UTF-8&q=${encodedText}&tl=${langCode}&client=tw-ob&total=1&idx=0&textlen=${text.length}`;
};

module.exports = {
  generateHindiVoiceAlert,
  broadcastVoiceAlert,
  getHindiMessage,
  generateVoiceURL,
  HINDI_MESSAGES,
};
