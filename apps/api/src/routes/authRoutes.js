const express = require('express');
const { authLimiter } = require('../middleware/rateLimiter');
const defaultRequireAuth = require('../middleware/requireAuth');
const authController = require('../controllers/authController');

function createAuthRouter({ authMiddleware = defaultRequireAuth } = {}) {
  const router = express.Router();

  router.post('/register', authLimiter, authController.register);
  router.post('/login', authLimiter, authController.login);
  router.get('/verify-email', authController.verifyEmail);
  router.post('/verify-email', authController.verifyEmail);
  router.post('/logout', authMiddleware, authController.logout);
  router.get('/me', authMiddleware, authController.getCurrentUser);

  return router;
}

const defaultAuthRouter = createAuthRouter();
defaultAuthRouter.createAuthRouter = createAuthRouter;

module.exports = defaultAuthRouter;
module.exports.createAuthRouter = createAuthRouter;
