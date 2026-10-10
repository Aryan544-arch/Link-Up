const express = require('express');
const safetyController = require('../controllers/safety.controller');
const { validateBody } = require('../middleware/validate');
const {
  createReportSchema,
  createBlockSchema
} = require('../validators/safety.validator');
const { requireAuth: defaultRequireAuth } = require('../middleware/auth.integration');

/**
 * Router factory for /api/reports endpoints.
 */
function createReportRouter(options = {}) {
  const router = express.Router();
  const requireAuth = options.authMiddleware || defaultRequireAuth;

  router.post(
    '/',
    requireAuth,
    validateBody(createReportSchema),
    safetyController.createReport
  );

  return router;
}

/**
 * Router factory for /api/blocks endpoints.
 */
function createBlockRouter(options = {}) {
  const router = express.Router();
  const requireAuth = options.authMiddleware || defaultRequireAuth;

  router.post(
    '/',
    requireAuth,
    validateBody(createBlockSchema),
    safetyController.createBlock
  );

  router.get(
    '/',
    requireAuth,
    safetyController.getBlocks
  );

  router.delete(
    '/:userId',
    requireAuth,
    safetyController.deleteBlock
  );

  return router;
}

module.exports = {
  createReportRouter,
  createBlockRouter
};
