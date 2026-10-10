const express = require('express');
const profileController = require('../controllers/profile.controller');
const { validateBody } = require('../middleware/validate');
const {
  updateProfileSchema,
  updatePreferencesSchema
} = require('../validators/profile.validator');
const { requireAuth: defaultRequireAuth } = require('../middleware/auth.integration');

/**
 * Router factory for /api/me endpoints (profile & preferences).
 *
 * @param {object} options
 * @param {Function} [options.authMiddleware] - Optional auth middleware override for testing
 * @returns {express.Router}
 */
function createProfileRouter(options = {}) {
  const router = express.Router();
  const requireAuth = options.authMiddleware || defaultRequireAuth;

  router.patch(
    '/profile',
    requireAuth,
    validateBody(updateProfileSchema),
    profileController.updateProfile
  );

  router.get(
    '/preferences',
    requireAuth,
    profileController.getPreferences
  );

  router.patch(
    '/preferences',
    requireAuth,
    validateBody(updatePreferencesSchema),
    profileController.updatePreferences
  );

  return router;
}

module.exports = {
  createProfileRouter
};
