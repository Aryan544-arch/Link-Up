const interestRequestService = require('../services/interestRequest.service');
const matchingService = require('../services/matching.service');
const { apiSuccess } = require('../utils/apiResponse');
const { getAuthUserId } = require('../middleware/auth.integration');

async function createInterestRequest(req, res, next) {
  try {
    const userId = getAuthUserId(req);
    const result = await interestRequestService.createInterestRequest({
      payload: req.body,
      userId
    });
    return apiSuccess(res, result, 201);
  } catch (err) {
    next(err);
  }
}

async function listInterestRequests(req, res, next) {
  try {
    const userId = getAuthUserId(req);
    const result = await interestRequestService.getInterestRequests({
      userId,
      query: req.query
    });
    return apiSuccess(res, result, 200);
  } catch (err) {
    next(err);
  }
}

async function getInterestRequest(req, res, next) {
  try {
    const currentUserId = getAuthUserId(req);
    const result = await interestRequestService.getInterestRequestById({
      requestId: req.params.id,
      currentUserId
    });
    return apiSuccess(res, result, 200);
  } catch (err) {
    next(err);
  }
}

async function updateInterestRequest(req, res, next) {
  try {
    const currentUserId = getAuthUserId(req);
    const result = await interestRequestService.updateInterestRequest({
      requestId: req.params.id,
      payload: req.body,
      currentUserId
    });
    return apiSuccess(res, result, 200);
  } catch (err) {
    next(err);
  }
}

async function cancelInterestRequest(req, res, next) {
  try {
    const currentUserId = getAuthUserId(req);
    const result = await interestRequestService.cancelInterestRequest({
      requestId: req.params.id,
      currentUserId
    });
    return apiSuccess(res, result, 200);
  } catch (err) {
    next(err);
  }
}

async function getMatchesForRequest(req, res, next) {
  try {
    const currentUserId = getAuthUserId(req);
    const result = await matchingService.findMatchesForRequest({
      requestId: req.params.id,
      currentUserId
    });
    return apiSuccess(res, result, 200);
  } catch (err) {
    next(err);
  }
}

async function getMatchesForUser(req, res, next) {
  try {
    const userId = getAuthUserId(req);
    const result = await matchingService.findMatchesForUser({
      userId,
      query: req.query
    });
    return apiSuccess(res, result, 200);
  } catch (err) {
    next(err);
  }
}

module.exports = {
  createInterestRequest,
  listInterestRequests,
  getInterestRequest,
  updateInterestRequest,
  cancelInterestRequest,
  getMatchesForRequest,
  getMatchesForUser
};
