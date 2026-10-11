const express = require('express');
const cors = require('cors');
const env = require('./config/env');
const { configureSession } = require('./config/session');
const { generalLimiter } = require('./middleware/rateLimiter');
const { notFoundHandler, errorHandler } = require('./middleware/errorHandler');

const app = express();

// Trust proxy if running behind reverse proxy in production
if (env.NODE_ENV === 'production') {
  app.set('trust proxy', 1);
}

// CORS setup: allow client origin with credentials for session cookies
app.use(
  cors({
    origin: env.CLIENT_ORIGIN,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
  })
);

// Body parsers
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Session middleware using MongoDB store
app.use(configureSession());

// Rate limiting
app.use(generalLimiter);

// Baseline health check endpoint
app.get('/api/health', (req, res) => {
  res.status(200).json({
    success: true,
    data: {
      status: 'ok',
      timestamp: new Date().toISOString(),
      environment: env.NODE_ENV
    }
  });
});

// Test-only endpoints to verify session cookie issuance and persistence
if (env.NODE_ENV === 'test') {
  app.post('/api/test/session', (req, res) => {
    req.session.userId = req.body?.userId || 'test-user-id';
    res.status(200).json({
      success: true,
      data: { initialized: true, userId: req.session.userId }
    });
  });

  app.get('/api/test/session', (req, res) => {
    res.status(200).json({
      success: true,
      data: { userId: req.session.userId || null }
    });
  });
}

const authRoutes = require('./routes/authRoutes');
const userRoutes = require('./routes/userRoutes');
const notificationRoutes = require('./routes/notificationRoutes');

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/notifications', notificationRoutes);
// app.use('/api/ai', aiRoutes);

// 404 handler
app.use(notFoundHandler);

// Centralized error handler
app.use(errorHandler);

module.exports = app;
