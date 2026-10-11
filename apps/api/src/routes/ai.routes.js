const express = require('express');
const { requireAuth: defaultRequireAuth } = require('../middleware/auth.integration');
const { validateBody } = require('../middleware/validate');
const { planActivitySchema } = require('../validators/ai.validator');
const aiController = require('../controllers/ai.controller');

/**
 * AI Routes — MEETUP Pulse
 *
 * Mounts:
 * - POST /api/ai/plan-activity (Protected)
 * - GET  /api/ai/status (Public)
 *
 * Owner: Person 3 (Authentication and AI)
 */
function createAiRouter({ authMiddleware = defaultRequireAuth } = {}) {
  const router = express.Router();

  // Public status check (whether AI features are live or in fallback mode)
  router.get('/status', aiController.getStatus);

  // Authenticated activity blueprint generation
  router.post(
    '/plan-activity',
    authMiddleware,
    validateBody(planActivitySchema),
    aiController.planActivity
  );

  return router;
}

const defaultAiRouter = createAiRouter();
defaultAiRouter.createAiRouter = createAiRouter;
defaultAiRouter.defaultAiRouter = defaultAiRouter;

module.exports = defaultAiRouter;
module.exports.createAiRouter = createAiRouter;
module.exports.defaultAiRouter = defaultAiRouter;
