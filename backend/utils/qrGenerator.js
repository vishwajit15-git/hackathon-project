const QRCode = require('qrcode');
const logger = require('./logger');

/**
 * Generate a QR code as base64 data URL.
 * @param {object} data - Payload to encode
 * @returns {Promise<{ qrCode: string, qrData: string }>}
 */
const generateQRCode = async (data) => {
  const payload = JSON.stringify(data);
  try {
    const qrCode = await QRCode.toDataURL(payload, {
      errorCorrectionLevel: 'H',
      type: 'image/png',
      quality: 0.95,
      margin: 1,
      color: {
        dark: '#1a1a2e',
        light: '#ffffff',
      },
      width: 300,
    });
    return { qrCode, qrData: payload };
  } catch (err) {
    logger.error(`QR generation failed: ${err.message}`);
    throw new Error('Failed to generate QR code');
  }
};

/**
 * Generate booking QR code.
 * @param {object} booking - Booking document
 * @param {object} slot - Slot document
 * @param {object} user - User document
 */
const generateBookingQR = async (booking, slot, user) => {
  const qrPayload = {
    bookingId: booking.bookingId,
    userId: user.uid || user._id,
    slotId: slot.id || slot._id,
    zone: slot.zone || 'unknown',
    date: slot.date || slot.dateStr,
    time: `${slot.startTime} - ${slot.endTime}`,
    groupSize: booking.groupSize,
    isSpecialNeeds: booking.isSpecialNeeds,
    validatedAt: null, // to be filled on scan
  };
  return generateQRCode(qrPayload);
};

module.exports = { generateQRCode, generateBookingQR };
