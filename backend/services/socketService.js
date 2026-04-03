const logger = require('../utils/logger');

let _io = null;

/**
 * Initialize socket.io and store the instance.
 * Call once from server.js after httpServer is created.
 */
const initSocket = (httpServer) => {
  const { Server } = require('socket.io');

  _io = new Server(httpServer, {
    cors: {
      origin: process.env.FRONTEND_URL || '*',
      methods: ['GET', 'POST'],
    },
    pingTimeout: 60000,
    pingInterval: 25000,
  });

  _io.on('connection', (socket) => {
    logger.debug(`Socket connected: ${socket.id}`);

    // Client sends their role and userId to join relevant rooms
    socket.on('join:room', ({ role, userId, zone }) => {
      if (role) socket.join(`role:${role}`);
      if (userId) socket.join(`user:${userId}`);
      if (zone) socket.join(`zone:${zone.toUpperCase()}`);
      logger.debug(`Socket ${socket.id} joined rooms: role:${role}, user:${userId}, zone:${zone}`);
    });

    socket.on('disconnect', (reason) => {
      logger.debug(`Socket disconnected: ${socket.id} — ${reason}`);
    });

    socket.on('error', (err) => {
      logger.error(`Socket error on ${socket.id}: ${err.message}`);
    });
  });

  logger.info('Socket.io initialized without clustering (Local Mode)');
  return _io;
};

/**
 * Get the initialized io instance.
 * Throws if called before initSocket().
 */
const getIO = () => {
  if (!_io) throw new Error('Socket.io not initialized. Call initSocket(httpServer) first.');
  return _io;
};

// ─── Emit Helpers ─────────────────────────────────────────────────────────────

/**
 * Broadcast crowd update for a specific zone.
 * Emits to room: zone:<ZONE>
 */
const emitCrowdUpdate = (zone, data) => {
  try {
    getIO().to(`zone:${zone.toUpperCase()}`).emit('crowd:update', {
      zone: zone.toUpperCase(),
      ...data,
      timestamp: new Date().toISOString(),
    });
    // Also broadcast to admin room
    getIO().to('role:admin').emit('crowd:update', { zone: zone.toUpperCase(), ...data });
  } catch (err) {
    logger.error(`emitCrowdUpdate error: ${err.message}`);
  }
};

/**
 * Broadcast an emergency alert to ALL connected clients.
 */
const emitAlert = (alertData) => {
  try {
    getIO().emit('alert:emergency', {
      ...alertData,
      timestamp: new Date().toISOString(),
    });
    logger.info(`Emergency alert emitted: ${alertData.type} in zone ${alertData.zone}`);
  } catch (err) {
    logger.error(`emitAlert error: ${err.message}`);
  }
};

/**
 * Send safe route update to a specific user.
 */
const emitRouteUpdate = (userId, routeData) => {
  try {
    getIO().to(`user:${userId}`).emit('route:update', {
      ...routeData,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    logger.error(`emitRouteUpdate error: ${err.message}`);
  }
};

/**
 * Notify all when a missing person is found.
 */
const emitPersonFound = (caseId, data) => {
  try {
    getIO().emit('missing:found', {
      caseId,
      ...data,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    logger.error(`emitPersonFound error: ${err.message}`);
  }
};

/**
 * Send a task assignment to a specific volunteer.
 */
const emitVolunteerTask = (volunteerId, taskData) => {
  try {
    getIO().to(`user:${volunteerId}`).emit('volunteer:task', {
      ...taskData,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    logger.error(`emitVolunteerTask error: ${err.message}`);
  }
};

module.exports = {
  initSocket,
  getIO,
  emitCrowdUpdate,
  emitAlert,
  emitRouteUpdate,
  emitPersonFound,
  emitVolunteerTask,
};
