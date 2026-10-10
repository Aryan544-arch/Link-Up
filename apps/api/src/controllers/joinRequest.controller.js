const joinRequestService = require('../services/joinRequest.service');
const { apiSuccess } = require('../utils/apiResponse');
const { getAuthUserId } = require('../middleware/auth.integration');

async function createJoinRequest(req, res, next) {
  try {
    const activityId = req.params.id;
    const userId = getAuthUserId(req);
    const joinRequest = await joinRequestService.requestToJoin({
      activityId,
      userId,
      note: req.body.note
    });
    return apiSuccess(res, joinRequest, 201);
  } catch (err) {
    next(err);
  }
}

async function getRequestsForActivity(req, res, next) {
  try {
    const activityId = req.params.id;
    const currentUserId = getAuthUserId(req);
    const result = await joinRequestService.getActivityJoinRequests({
      activityId,
      currentUserId,
      query: req.query
    });
    return apiSuccess(res, result, 200);
  } catch (err) {
    next(err);
  }
}

async function decideRequest(req, res, next) {
  try {
    const requestId = req.params.id;
    const decision = req.body.status;
    const currentUserId = getAuthUserId(req);
    const updatedRequest = await joinRequestService.decideJoinRequest({
      requestId,
      decision,
      currentUserId
    });
    return apiSuccess(res, updatedRequest, 200);
  } catch (err) {
    next(err);
  }
}

async function cancelOwnRequest(req, res, next) {
  try {
    const requestId = req.params.id;
    const currentUserId = getAuthUserId(req);
    const cancelledRequest = await joinRequestService.cancelJoinRequest({
      requestId,
      currentUserId,
      reason: req.body.reason
    });
    return apiSuccess(res, cancelledRequest, 200);
  } catch (err) {
    next(err);
  }
}

module.exports = {
  createJoinRequest,
  getRequestsForActivity,
  decideRequest,
  cancelOwnRequest
};
