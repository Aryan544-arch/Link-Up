const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const session = require('express-session');
const env = require('./config/env');
const { configureSession } = require('./config/session');
const { generalLimiter } = require('./middleware/rateLimiter');
const healthRoutes = require('./routes/health.routes');
const { createAuthRouter } = require('./routes/auth.routes');
const authRoutes = require('./routes/authRoutes');
const { createActivityRouter } = require('./routes/activity.routes');
const { createJoinRequestRouter } = require('./routes/joinRequest.routes');
const { createInterestRequestRouter } = require('./routes/interestRequest.routes');
const { createProposalRouter } = require('./routes/proposal.routes');
const { createPlansRouter } = require('./routes/plans.routes');
const { createProfileRouter } = require('./routes/profile.routes');
const { createNotificationRouter } = require('./routes/notification.routes');
const { createReportRouter, createBlockRouter } = require('./routes/safety.routes');
const aiRoutes = require('./routes/ai.routes');
const userRoutes = require('./routes/userRoutes');
const { attachSessionUser } = require('./middleware/auth.integration');
const { notFoundHandler, errorHandler } = require('./middleware/errorHandler');

function createApp({ authMiddleware, optionalAuthMiddleware, sessionStore } = {}) {
  const app = express();

  // Trust proxy in production
  if (env.NODE_ENV === 'production') {
    app.set('trust proxy', 1);
  }

  // Basic security headers
  app.use(helmet());

  // CORS configuration
  app.use(
    cors({
      origin: env.CLIENT_ORIGIN,
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization']
    })
  );

  // Request body parsing
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));

  // Session middleware
  const isTestMode =
    env.NODE_ENV === 'test' ||
    process.env.NODE_ENV === 'test' ||
    process.env.npm_lifecycle_event === 'test' ||
    process.execArgv.includes('--test') ||
    process.argv.some((a) => a.includes('test'));

  if (sessionStore) {
    app.use(
      session({
        name: 'connect.sid',
        secret: env.SESSION_SECRET || 'meetup-pulse-dev-secret-key-at-least-16-chars',
        resave: false,
        saveUninitialized: false,
        store: sessionStore,
        cookie: {
          httpOnly: true,
          secure: env.NODE_ENV === 'production',
          sameSite: 'lax',
          maxAge: 7 * 24 * 60 * 60 * 1000
        }
      })
    );
  } else if (isTestMode) {
    app.use(
      session({
        name: 'connect.sid',
        secret: env.SESSION_SECRET || 'meetup-pulse-dev-secret-key-at-least-16-chars',
        resave: false,
        saveUninitialized: false,
        store: new session.MemoryStore(),
        cookie: {
          httpOnly: true,
          secure: false,
          sameSite: 'lax',
          maxAge: 7 * 24 * 60 * 60 * 1000
        }
      })
    );
  } else {
    app.use(configureSession());
  }

  // Rate limiting (bypass in unit tests to prevent 429)
  if (!isTestMode) {
    app.use(generalLimiter);
  }

  // Test-only endpoints to verify session cookie issuance and persistence
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
      data: { userId: req.session?.userId || null }
    });
  });

  // Hydrate req.user from session
  app.use(attachSessionUser);

  // Baseline health check & DB status
  app.use('/api', healthRoutes);

  // Authentication routes (Person 3 Auth & Email verification)
  app.use(
    '/api/auth',
    typeof authRoutes.createAuthRouter === 'function'
      ? authRoutes.createAuthRouter({ authMiddleware })
      : authRoutes
  );

  // Core Marketplace and Activity routes (Person 2)
  app.use(
    '/api/activities',
    createActivityRouter({ authMiddleware, optionalAuthMiddleware })
  );
  app.use(
    '/api/join-requests',
    createJoinRequestRouter({ authMiddleware })
  );
  app.use(
    '/api/interest-requests',
    createInterestRequestRouter({ authMiddleware })
  );
  app.use(
    '/api/proposals',
    createProposalRouter({ authMiddleware })
  );
  app.use(
    '/api/me/plans',
    createPlansRouter({ authMiddleware })
  );
  app.use(
    '/api/me',
    createProfileRouter({ authMiddleware })
  );
  app.use(
    '/api/notifications',
    createNotificationRouter({ authMiddleware })
  );
  app.use(
    '/api/reports',
    createReportRouter({ authMiddleware })
  );
  app.use(
    '/api/blocks',
    createBlockRouter({ authMiddleware })
  );

  // User routes (Person 3)
  app.use('/api/users', userRoutes);

  // AI Planning Foundation (Person 3)
  app.use(
    '/api/ai',
    typeof aiRoutes.createAiRouter === 'function'
      ? aiRoutes.createAiRouter({ authMiddleware })
      : aiRoutes
  );

  // 404 Handler for undefined routes
  app.use(notFoundHandler);

  // Centralized Error Handler
  app.use(errorHandler);

  return app;
}

const app = createApp();

module.exports = app;
module.exports.createApp = createApp;
module.exports.app = app;
