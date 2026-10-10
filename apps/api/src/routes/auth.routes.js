const express = require('express');
const { requireAuth: defaultRequireAuth } = require('../middleware/auth.integration');
const { validateBody } = require('../middleware/validate');
const { registerSchema, loginSchema } = require('../validators/auth.validator');
const authController = require('../controllers/auth.controller');

/**
 * Authentication Routes — MEETUP Pulse
 * Mounts:
 * - POST /api/auth/register
 * - POST /api/auth/login
 * - POST /api/auth/logout
 * - GET  /api/auth/me
 */
function createAuthRouter({ authMiddleware = defaultRequireAuth } = {}) {
  const router = express.Router();

  // Register new user
  router.post(
    '/register',
    validateBody(registerSchema),
    authController.register
  );

  // Login with credentials
  router.post(
    '/login',
    validateBody(loginSchema),
    authController.login
  );

  // Logout / clear session
  router.post(
    '/logout',
    authController.logout
  );

  // Current authenticated user profile
  router.get(
    '/me',
    authMiddleware,
    authController.getMe
  );

  return router;
}

module.exports = {
  createAuthRouter,
  defaultAuthRouter: createAuthRouter()
};
