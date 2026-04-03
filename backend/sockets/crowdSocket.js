const logger = require('../utils/logger');

/**
 * Crowd Socket Handler
 * Registers socket event listeners for real-time crowd management.
 * @param {import('socket.io').Server} io
 */
const registerCrowdSocketHandlers = (io) => {
  io.on('connection', (socket) => {

    // Admin manually pushes a crowd update via socket (alternative to REST API)
    socket.on('crowd:manual-update', async (data) => {
      try {
        const { zone, currentCount, totalCapacity } = data;
        if (!zone || currentCount === undefined || !totalCapacity) return;

        const Crowd = require('../models/Crowd');
        const record = new Crowd({
          zone: zone.toUpperCase(),
          currentCount,
          totalCapacity,
          source: 'manual',
        });
        await record.save();

        // Re-broadcast to all zone members
        io.to(`zone:${zone.toUpperCase()}`).emit('crowd:update', {
          zone: zone.toUpperCase(),
          currentCount,
          totalCapacity,
          density: record.density,
          riskLevel: record.riskLevel,
          estimatedWaitMinutes: record.estimatedWaitMinutes,
          timestamp: new Date().toISOString(),
        });

        // Also broadcast to admin room
        io.to('role:admin').emit('crowd:update', {
          zone: zone.toUpperCase(),
          density: record.density,
          riskLevel: record.riskLevel,
        });

        logger.debug(`[Socket] crowd:manual-update from ${socket.id}: Zone ${zone}`);
      } catch (err) {
        logger.error(`[Socket] crowd:manual-update error: ${err.message}`);
        socket.emit('app:error', { message: 'Failed to process crowd update.' });
      }
    });

    // Client requests latest crowd status for a specific zone
    socket.on('crowd:get-status', async ({ zone }) => {
      try {
        const Crowd = require('../models/Crowd');
        const latest = await Crowd.findOne({ zone: zone.toUpperCase() }).sort({ timestamp: -1 });
        socket.emit('crowd:status-response', latest || { zone: zone.toUpperCase(), message: 'No data available.' });
      } catch (err) {
        logger.error(`[Socket] crowd:get-status error: ${err.message}`);
      }
    });

    // Volunteer updates their zone
    socket.on('volunteer:zone-update', async ({ volunteerId, zone }) => {
      try {
        const Volunteer = require('../models/Volunteer');
        await Volunteer.findByIdAndUpdate(volunteerId, { zone: zone.toUpperCase() });
        socket.join(`zone:${zone.toUpperCase()}`);
        socket.leave(socket.previousZone || ''); // leave old zone room
        socket.previousZone = `zone:${zone.toUpperCase()}`;
        logger.debug(`[Socket] Volunteer ${volunteerId} moved to zone ${zone}`);
      } catch (err) {
        logger.error(`[Socket] volunteer:zone-update error: ${err.message}`);
      }
    });
  });

  logger.info('[Socket] Crowd socket handlers registered');
};

module.exports = { registerCrowdSocketHandlers };
