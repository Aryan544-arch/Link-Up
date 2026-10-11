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

/**
 * Determines whether a hostname corresponds to localhost, IPv4 loopback,
 * or a private IPv4 LAN address according to RFC 1918 / RFC 3330.
 *
 * Private IPv4 blocks:
 * - 10.0.0.0/8 (10.0.0.0 - 10.255.255.255), e.g. 10.162.61.69
 * - 172.16.0.0/12 (172.16.0.0 - 172.31.255.255)
 * - 192.168.0.0/16 (192.168.0.0 - 192.168.255.255)
 * - 127.0.0.0/8 (127.0.0.0 - 127.255.255.255, loopback)
 */
function isPrivateOrLocalHost(hostname) {
  if (typeof hostname !== 'string') return false;
  const h = hostname.trim().toLowerCase();
  if (h === 'localhost') return true;
  // 127.0.0.0/8 (loopback)
  if (/^127(?:\.(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)){3}$/.test(h)) return true;
  // 10.0.0.0/8 (private Class A, e.g. 10.162.61.69)
  if (/^10(?:\.(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)){3}$/.test(h)) return true;
  // 172.16.0.0/12 (private Class B, 172.16.0.0 - 172.31.255.255)
  if (/^172\.(?:1[6-9]|2[0-9]|3[0-1])(?:\.(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)){2}$/.test(h)) return true;
  // 192.168.0.0/16 (private Class C, 192.168.0.0 - 192.168.255.255)
  if (/^192\.168(?:\.(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)){2}$/.test(h)) return true;
  return false;
}

function isAllowedLocalDevOrigin(origin) {
  if (typeof origin !== 'string' || !origin.trim()) return false;
  try {
    const parsed = new URL(origin);
    // Strictly require http or https protocol
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
    // Strictly require that origin has no path, query, hash, or embedded credentials
    if (origin !== `${parsed.protocol}//${parsed.host}`) return false;
    // Verify hostname is localhost, loopback, or private IPv4 LAN
    if (!isPrivateOrLocalHost(parsed.hostname)) return false;
    // Validate port is in valid range (1 - 65535)
    const port = parsed.port ? parseInt(parsed.port, 10) : (parsed.protocol === 'https:' ? 443 : 80);
    return port > 0 && port <= 65535;
  } catch {
    return false;
  }
}

function parseConfiguredOrigins(clientOrigin) {
  if (Array.isArray(clientOrigin)) {
    return clientOrigin
      .map((o) => (typeof o === 'string' ? o.trim() : ''))
      .filter((o) => Boolean(o) && o !== '*');
  }
  if (typeof clientOrigin === 'string') {
    return clientOrigin
      .split(',')
      .map((origin) => origin.trim())
      .filter((origin) => Boolean(origin) && origin !== '*');
  }
  return [];
}

function createCorsOriginValidator(clientOrigin = env.CLIENT_ORIGIN, nodeEnv = env.NODE_ENV) {
  const isProduction = nodeEnv === 'production';
  const configuredOrigins = parseConfiguredOrigins(clientOrigin);

  return function corsOriginValidator(origin, callback) {
    // 1. Non-browser / same-origin requests without an Origin header
    if (!origin) {
      return callback(null, true);
    }

    // 2. Explicitly configured trusted origins (valid across all environments)
    if (configuredOrigins.includes(origin)) {
      return callback(null, true);
    }

    // 3. In non-production environments only, accept legitimate local dev frontend origins
    //    with dynamically assigned ports on localhost or 127.0.0.1
    if (!isProduction && isAllowedLocalDevOrigin(origin)) {
      return callback(null, true);
    }

    // 4. Reject all unconfigured external or arbitrary origins
    return callback(null, false);
  };
}

function resolveAllowedOrigins(clientOrigin, nodeEnv = env.NODE_ENV) {
  const configured = parseConfiguredOrigins(clientOrigin);

  if (nodeEnv !== 'production') {
    const devDefaults = ['http://localhost:5173', 'http://localhost:5174', 'http://localhost:5175'];
    for (const devOrigin of devDefaults) {
      if (!configured.includes(devOrigin)) {
        configured.push(devOrigin);
      }
    }
  }

  return configured.length > 0 ? configured : ['http://localhost:5173'];
}

function createApp(options = {}) {
  const { authMiddleware, optionalAuthMiddleware, sessionStore, corsOrigin } = options;
  const app = express();

  // Trust proxy in production
  if (env.NODE_ENV === 'production') {
    app.set('trust proxy', 1);
  }

  // Basic security headers
  app.use(helmet());

  // CORS configuration
  const originValidator = corsOrigin !== undefined
    ? (typeof corsOrigin === 'function' ? corsOrigin : createCorsOriginValidator(corsOrigin, env.NODE_ENV))
    : createCorsOriginValidator(env.CLIENT_ORIGIN, env.NODE_ENV);

  app.use(
    cors({
      origin: originValidator,
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
  if (isTestMode || env.NODE_ENV === 'test') {
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
  }

  // Hydrate req.user from session
  app.use(attachSessionUser);

  // Baseline health check & DB status
  app.use('/api', healthRoutes);

  // Authentication routes (Person 3 Auth & Email verification)
  app.use(
    '/api/auth',
    typeof authRoutes.createAuthRouter === 'function'
      ? authRoutes.createAuthRouter(options)
      : authRoutes
  );

  // Core Marketplace and Activity / Contest routes (Person 2)
  const activityRouter = createActivityRouter(options);
  app.use('/api/activities', activityRouter);
  app.use('/api/contests', activityRouter);
  app.use(
    '/api/join-requests',
    createJoinRequestRouter(options)
  );
  app.use(
    '/api/interest-requests',
    createInterestRequestRouter(options)
  );
  app.use(
    '/api/proposals',
    createProposalRouter(options)
  );
  app.use(
    '/api/me/plans',
    createPlansRouter(options)
  );
  app.use(
    '/api/me',
    createProfileRouter(options)
  );
  app.use(
    '/api/notifications',
    createNotificationRouter(options)
  );
  app.use(
    '/api/reports',
    createReportRouter(options)
  );
  app.use(
    '/api/blocks',
    createBlockRouter(options)
  );

  // User routes (Person 3)
  app.use('/api/users', userRoutes);

  // AI Planning Foundation (Person 3)
  app.use(
    '/api/ai',
    typeof aiRoutes.createAiRouter === 'function'
      ? aiRoutes.createAiRouter(options)
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
module.exports.default = app;
module.exports.resolveAllowedOrigins = resolveAllowedOrigins;
module.exports.createCorsOriginValidator = createCorsOriginValidator;
module.exports.isAllowedLocalDevOrigin = isAllowedLocalDevOrigin;
module.exports.isPrivateOrLocalHost = isPrivateOrLocalHost;
module.exports.parseConfiguredOrigins = parseConfiguredOrigins;
