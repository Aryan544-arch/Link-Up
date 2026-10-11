const express = require('express');
const cors = require('cors');
const env = require('./config/env');
const { configureSession } = require('./config/session');
const { generalLimiter } = require('./middleware/rateLimiter');
const { notFoundHandler, errorHandler } = require('./middleware/errorHandler');
const { createAuthRouter } = require('./routes/auth.routes');
const { createActivityRouter } = require('./routes/activity.routes');
const { createPlansRouter } = require('./routes/plans.routes');
const { createProfileRouter } = require('./routes/profile.routes');
const { createNotificationRouter } = require('./routes/notification.routes');
const { createInterestRequestRouter } = require('./routes/interestRequest.routes');
const { createJoinRequestRouter } = require('./routes/joinRequest.routes');
const { createProposalRouter } = require('./routes/proposal.routes');
const { createReportRouter, createBlockRouter } = require('./routes/safety.routes');

function createApp(options = {}) {
  const app = express();

  if (env.NODE_ENV === 'production') {
    app.set('trust proxy', 1);
  }

  app.use(
    cors({
      origin: env.CLIENT_ORIGIN,
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization']
    })
  );

  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use(configureSession());
  app.use(generalLimiter);

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

  app.use('/api/auth', createAuthRouter(options));
  app.use('/api/activities', createActivityRouter(options));
  app.use('/api/notifications', createNotificationRouter(options));
  app.use('/api/interest-requests', createInterestRequestRouter(options));
  app.use('/api/join-requests', createJoinRequestRouter(options));
  app.use('/api/proposals', createProposalRouter(options));
  app.use('/api/reports', createReportRouter(options));
  app.use('/api/blocks', createBlockRouter(options));
  app.use('/api/me', createProfileRouter(options));
  app.use('/api/me/plans', createPlansRouter(options));

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

const app = createApp();

module.exports = app;
module.exports.createApp = createApp;
module.exports.default = app;
