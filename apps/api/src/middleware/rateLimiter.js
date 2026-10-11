let rateLimit;
try {
  rateLimit = require('express-rate-limit');
} catch (e) {
  // Fallback no-op middleware if express-rate-limit is not installed in local directory
  rateLimit = (options) => (req, res, next) => next();
}

const env = require('../config/env');

const generalLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS || 15 * 60 * 1000,
  max: env.RATE_LIMIT_MAX || 100,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    res.status(429).json({
      success: false,
      error: {
        code: 'RATE_LIMITED',
        message: 'Too many requests. Please try again later.'
      }
    });
  }
});

// Specific stricter limiter for sensitive authentication endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // 20 attempts per 15 minutes
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    res.status(429).json({
      success: false,
      error: {
        code: 'RATE_LIMITED',
        message: 'Too many authentication attempts. Please try again later.'
      }
    });
  }
});

module.exports = { generalLimiter, authLimiter };
