const http = require('http');
const { validateEnv } = require('./config/env');

// Validate env vars before doing anything else
validateEnv();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');

const { initFirebase } = require('./config/firebaseAdmin');
const { initSocket } = require('./services/socketService');
const { registerCrowdSocketHandlers } = require('./sockets/crowdSocket');
const { registerAlertSocketHandlers } = require('./sockets/alertSocket');
const logger = require('./utils/logger');

// ─── Route Imports ─────────────────────────────────────────────────────────────
const authRoutes        = require('./routes/authRoutes');
const slotRoutes        = require('./routes/slotRoutes');
const crowdRoutes       = require('./routes/crowdRoutes');
const alertRoutes       = require('./routes/alertRoutes');
const missingRoutes     = require('./routes/missingRoutes');
const volunteerRoutes   = require('./routes/volunteerRoutes');
const predictionRoutes  = require('./routes/predictionRoutes');
const collisionRoutes   = require('./routes/collisionRoutes');
const voiceRoutes       = require('./routes/voiceRoutes');

// ─── App Init ──────────────────────────────────────────────────────────────────
const app = express();
const httpServer = http.createServer(app);

// ─── Security Middleware ───────────────────────────────────────────────────────
app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_URL || '*',
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
}));

// ─── HTTP Logging ──────────────────────────────────────────────────────────────
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev', {
  stream: { write: (msg) => logger.http(msg.trim()) },
}));

// ─── Body Parsing ──────────────────────────────────────────────────────────────
app.use(express.json({ limit: '10mb' })); // 10mb for base64 image uploads
app.use(express.urlencoded({ extended: true }));

// ─── Global Rate Limiting ──────────────────────────────────────────────────────
const globalLimiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_MAX) || 1000,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many requests. Please try again later.' },
});
app.use('/api/', globalLimiter);

// Stricter limiter for auth endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { success: false, message: 'Too many auth attempts. Try again in 15 minutes.' },
});
app.use('/api/auth/', authLimiter);

// ─── Health Check ──────────────────────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    service: 'Smart Crowd Management API',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    uptime: `${Math.floor(process.uptime())}s`,
  });
});

// ─── API Routes ────────────────────────────────────────────────────────────────
app.use('/api/auth',        authRoutes);
app.use('/api/slots',       slotRoutes);
app.use('/api/crowd',       crowdRoutes);
app.use('/api/alerts',      alertRoutes);
app.use('/api/missing',     missingRoutes);
app.use('/api/volunteer',   volunteerRoutes);
app.use('/api/prediction',  predictionRoutes);
app.use('/api/collision',   collisionRoutes);
app.use('/api/voice',       voiceRoutes);

// ─── 404 Handler ───────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ success: false, message: `Route ${req.method} ${req.path} not found.` });
});

// ─── Global Error Handler ──────────────────────────────────────────────────────
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  logger.error(`Unhandled error: ${err.message}`, { stack: err.stack });

  if (err.name === 'ValidationError') {
    const messages = Object.values(err.errors).map((e) => e.message);
    return res.status(400).json({ success: false, message: 'Validation failed.', errors: messages });
  }

  if (err.code === 11000) {
    const field = Object.keys(err.keyValue)[0];
    return res.status(409).json({ success: false, message: `${field} already exists.` });
  }

  res.status(err.status || 500).json({
    success: false,
    message: process.env.NODE_ENV === 'production' ? 'Internal server error.' : err.message,
  });
});

// ─── Project Startup ────────────────────────────────────────────────────────────
const startServer = async () => {
  try {
    // 1. Initialize Firebase Handshake (Immediate)
    const { db, auth } = initFirebase();
    global.db = db;
    global.adminAuth = auth;

    // 2. Initialize Socket.io Layer
    const io = initSocket(httpServer);
    registerCrowdSocketHandlers(io);
    registerAlertSocketHandlers(io);

    // 3. Start Listening
    const PORT = parseInt(process.env.PORT) || 5000;
    httpServer.listen(PORT, () => {
      logger.info(`🚀 Server running on port ${PORT} [${process.env.NODE_ENV || 'development'}]`);
      logger.info(`📡 WebSocket server ready`);
      logger.info(`🏥 Health check: http://localhost:${PORT}/health`);
    });
  } catch (err) {
    logger.error(`🚨 Fatal startup error: ${err.message}`);
    process.exit(1);
  }
};

startServer();

module.exports = { app, httpServer };
