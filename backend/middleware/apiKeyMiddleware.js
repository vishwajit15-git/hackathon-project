const logger = require('../utils/logger');

/**
 * API Key middleware factory.
 * Reads the expected key from environment variables.
 *
 * Usage: requireApiKey('ML_API_KEY')
 * Client must send: x-api-key: <value>
 */
const requireApiKey = (envVarName) => {
  return (req, res, next) => {
    const expectedKey = process.env[envVarName];

    if (!expectedKey) {
      logger.error(`API key env var '${envVarName}' is not set. Denying request.`);
      return res.status(500).json({ success: false, message: 'Server misconfiguration: API key not configured.' });
    }

    const providedKey = req.headers['x-api-key'];
    if (!providedKey || providedKey !== expectedKey) {
      logger.warn(`Invalid or missing API key for route protected by '${envVarName}'. IP: ${req.ip}`);
      return res.status(401).json({ success: false, message: 'Invalid or missing API key.' });
    }

    next();
  };
};

module.exports = { requireApiKey };
