const aiService = require('../services/ai.service');
const { apiSuccess } = require('../utils/apiResponse');

/**
 * AI Planning Controller — MEETUP Pulse
 *
 * Implements AI activity drafting and status endpoints.
 * Owner: Person 3 (Authentication and AI)
 */

async function planActivity(req, res, next) {
  try {
    const input = { ...req.body };
    if (!input.displayArea && input.locationHint) {
      input.displayArea = input.locationHint;
    }
    if (input.targetGroupSize && (!req.body.groupSize || req.body.groupSize === 6)) {
      input.groupSize = input.targetGroupSize;
    }
    const result = await aiService.generateActivityPlan(input);
    return apiSuccess(res, result, 200);
  } catch (err) {
    next(err);
  }
}

async function getStatus(req, res, next) {
  try {
    const status = aiService.getAiStatus();
    return apiSuccess(res, status, 200);
  } catch (err) {
    next(err);
  }
}

module.exports = {
  planActivity,
  getStatus
};
