const plansService = require('../services/plans.service');
const { apiSuccess } = require('../utils/apiResponse');
const { getAuthUserId } = require('../middleware/auth.integration');

/**
 * Plans Controller — MEETUP Pulse
 * Handles GET /api/me/plans
 */
async function getMyPlans(req, res, next) {
  try {
    const userId = getAuthUserId(req);
    const plans = await plansService.getMyPlans({
      userId,
      query: req.query
    });
    return apiSuccess(res, plans, 200);
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getMyPlans
};
