const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const session = require('express-session');
const { MongoStore } = require('connect-mongo');
const { env } = require('./config/env');
const healthRoutes = require('./routes/health.routes');
const { createAuthRouter } = require('./routes/auth.routes');
const { createActivityRouter } = require('./routes/activity.routes');
const { createJoinRequestRouter } = require('./routes/joinRequest.routes');
const { createInterestRequestRouter } = require('./routes/interestRequest.routes');
const { createProposalRouter } = require('./routes/proposal.routes');
const { createPlansRouter } = require('./routes/plans.routes');
const { createProfileRouter } = require('./routes/profile.routes');
const { createNotificationRouter } = require('./routes/notification.routes');
const { createReportRouter, createBlockRouter } = require('./routes/safety.routes');
const { attachSessionUser } = require('./middleware/auth.integration');
const { notFoundHandler } = require('./middleware/notFoundHandler');
const { errorHandler } = require('./middleware/errorHandler');

function createApp({ authMiddleware, optionalAuthMiddleware, sessionStore } = {}) {
  const app = express();

  // Basic security headers
  app.use(helmet());

  // CORS configuration
  app.use(
    cors({
      origin: env.CLIENT_ORIGIN,
      credentials: true
    })
  );

  // Request body parsing
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));

  // Session middleware
  let store = sessionStore;
  if (!store) {
    const isTestMode =
      env.NODE_ENV === 'test' ||
      process.env.NODE_ENV === 'test' ||
      process.env.npm_lifecycle_event === 'test' ||
      process.execArgv.includes('--test') ||
      process.argv.some((a) => a.includes('test'));

    if (isTestMode) {
      store = new session.MemoryStore();
    } else {
      try {
        store = MongoStore.create({
          mongoUrl: env.MONGODB_URI,
          collectionName: 'sessions',
          ttl: 14 * 24 * 60 * 60,
          autoRemove: 'native'
        });
      } catch (storeErr) {
        console.warn('[Session] Failed to initialize MongoStore, falling back to MemoryStore:', storeErr.message);
        store = new session.MemoryStore();
      }
    }
  }

  app.use(
    session({
      name: 'connect.sid',
      secret: env.SESSION_SECRET || 'meetup-pulse-dev-secret-key-at-least-16-chars',
      resave: false,
      saveUninitialized: false,
      store,
      cookie: {
        httpOnly: true,
        secure: env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
      }
    })
  );

  // Hydrate req.user from session
  app.use(attachSessionUser);

  // API Routes
  app.use('/api', healthRoutes);
  app.use('/api/auth', createAuthRouter({ authMiddleware }));
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

  // 404 Handler for undefined routes
  app.use(notFoundHandler);

  // Centralized Error Handler
  app.use(errorHandler);

  return app;
}

const app = createApp();

module.exports = {
  createApp,
  app
};
