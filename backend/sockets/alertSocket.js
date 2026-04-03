const logger = require('../utils/logger');

/**
 * Alert Socket Handler
 * Manages emergency event lifecycle via WebSocket.
 * @param {import('socket.io').Server} io
 */
const registerAlertSocketHandlers = (io) => {
  io.on('connection', (socket) => {

    // Staff acknowledges an emergency alert
    socket.on('emergency:acknowledge', async ({ alertId, acknowledgedBy, role }) => {
      try {
        logger.info(`[Socket] Alert ${alertId} acknowledged by ${acknowledgedBy} [${role}]`);

        // Notify admin room that alert was acknowledged
        io.to('role:admin').emit('alert:acknowledged', {
          alertId,
          acknowledgedBy,
          role,
          timestamp: new Date().toISOString(),
        });
      } catch (err) {
        logger.error(`[Socket] emergency:acknowledge error: ${err.message}`);
      }
    });

    // Request live safe routes for a zone during emergency
    socket.on('route:request', async ({ fromZone, toZone, currentDensityMap }) => {
      try {
        const { getSafeRoute } = require('../services/geoService');
        const route = getSafeRoute(fromZone, toZone, currentDensityMap || {});
        socket.emit('route:response', { fromZone, toZone, route });
      } catch (err) {
        logger.error(`[Socket] route:request error: ${err.message}`);
        socket.emit('route:response', { error: err.message });
      }
    });

    // Admin sends evacuation order to a zone
    socket.on('evacuation:trigger', async ({ zone, message, routes }) => {
      try {
        // Only trust this event from admin sockets (validated via JWT in real prod)
        logger.warn(`[Socket] Evacuation triggered for zone ${zone} by ${socket.id}`);

        io.to(`zone:${zone?.toUpperCase()}`).emit('evacuation:order', {
          zone: zone?.toUpperCase(),
          message: message || `EVACUATE Zone ${zone?.toUpperCase()} immediately via the displayed route.`,
          routes: routes || [],
          timestamp: new Date().toISOString(),
        });

        // Also notify staff
        io.to('role:police').emit('evacuation:order', { zone, routes });
        io.to('role:medical').emit('evacuation:order', { zone, routes });
      } catch (err) {
        logger.error(`[Socket] evacuation:trigger error: ${err.message}`);
      }
    });

    // Alert voice acknowledgement from client device
    socket.on('voice:received', ({ alertId }) => {
      logger.debug(`[Socket] Voice alert ${alertId} received by client ${socket.id}`);
    });

  });

  logger.info('[Socket] Alert socket handlers registered');
};

module.exports = { registerAlertSocketHandlers };
