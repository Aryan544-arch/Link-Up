const express = require('express');
const { requireAuth: defaultRequireAuth } = require('../middleware/auth.integration');
const plansController = require('../controllers/plans.controller');

/**
 * Plans Routes — MEETUP Pulse
 * Mounts GET /api/me/plans (My Plans Dashboard)
 */
function createPlansRouter({ authMiddleware = defaultRequireAuth } = {}) {
  const router = express.Router();

  // GET /api/me/plans - My Plans Dashboard
  router.get('/', authMiddleware, plansController.getMyPlans);

  return router;
}

module.exports = {
  createPlansRouter,
  defaultPlansRouter: createPlansRouter()
};
