const logger = require('../utils/logger');

/**
 * Notification service for fan-out socket messages.
 * Sends role-specific, zone-specific, and user-specific notifications.
 */

/**
 * Notify one or more roles about an event.
 * @param {string[]} roles - e.g. ['police', 'medical']
 * @param {string} event - Socket event name
 * @param {object} data - Event payload
 */
const notifyRoles = (roles, event, data) => {
  try {
    const { getIO } = require('./socketService');
    const io = getIO();
    roles.forEach((role) => {
      io.to(`role:${role}`).emit(event, { ...data, timestamp: new Date().toISOString() });
    });
    logger.debug(`Notified roles [${roles.join(', ')}] with event: ${event}`);
  } catch (err) {
    logger.error(`notifyRoles error: ${err.message}`);
  }
};

/**
 * Notify all users in a specific zone.
 * @param {string} zone - Zone name
 * @param {string} event - Socket event name
 * @param {object} data - Event payload
 */
const notifyZone = (zone, event, data) => {
  try {
    const { getIO } = require('./socketService');
    getIO()
      .to(`zone:${zone.toUpperCase()}`)
      .emit(event, { zone: zone.toUpperCase(), ...data, timestamp: new Date().toISOString() });
    logger.debug(`Notified zone ${zone.toUpperCase()} with event: ${event}`);
  } catch (err) {
    logger.error(`notifyZone error: ${err.message}`);
  }
};

/**
 * Notify a specific user by userId.
 * @param {string} userId - MongoDB User ID
 * @param {string} event - Socket event name
 * @param {object} data - Event payload
 */
const notifyUser = (userId, event, data) => {
  try {
    const { getIO } = require('./socketService');
    getIO()
      .to(`user:${userId}`)
      .emit(event, { ...data, timestamp: new Date().toISOString() });
    logger.debug(`Notified user ${userId} with event: ${event}`);
  } catch (err) {
    logger.error(`notifyUser error: ${err.message}`);
  }
};

/**
 * Broadcast emergency to all connected clients + role rooms.
 * Used during critical high-severity events.
 */
const broadcastEmergency = (alertData) => {
  try {
    const { getIO } = require('./socketService');
    const io = getIO();

    // All clients
    io.emit('alert:emergency', { ...alertData, timestamp: new Date().toISOString() });

    // Additional targeted notifications
    notifyRoles(['police', 'medical', 'admin'], 'alert:priority', alertData);
    logger.info(`Emergency broadcast complete: ${alertData.type} severity ${alertData.severity}`);
  } catch (err) {
    logger.error(`broadcastEmergency error: ${err.message}`);
  }
};

module.exports = { notifyRoles, notifyZone, notifyUser, broadcastEmergency };
