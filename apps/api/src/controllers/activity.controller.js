const activityService = require('../services/activity.service');
const { apiSuccess } = require('../utils/apiResponse');
const { getAuthUserId } = require('../middleware/auth.integration');

async function listActivities(req, res, next) {
  try {
    const currentUserId = getAuthUserId(req);
    const result = await activityService.findActivities({
      query: req.query,
      currentUserId
    });
    return apiSuccess(res, result, 200);
  } catch (err) {
    next(err);
  }
}

async function createActivity(req, res, next) {
  try {
    const organizerId = getAuthUserId(req);
    const activity = await activityService.createActivity({
      payload: req.body,
      organizerId
    });
    return apiSuccess(res, activity, 201);
  } catch (err) {
    next(err);
  }
}

async function getActivity(req, res, next) {
  try {
    const currentUserId = getAuthUserId(req);
    const activity = await activityService.getActivityById(
      req.params.id,
      currentUserId
    );
    return apiSuccess(res, activity, 200);
  } catch (err) {
    next(err);
  }
}

async function updateActivity(req, res, next) {
  try {
    const currentUserId = getAuthUserId(req);
    const activity = await activityService.updateActivity({
      activityId: req.params.id,
      updateData: req.body,
      currentUserId
    });
    return apiSuccess(res, activity, 200);
  } catch (err) {
    next(err);
  }
}

async function publishActivity(req, res, next) {
  try {
    const currentUserId = getAuthUserId(req);
    const activity = await activityService.publishActivity({
      activityId: req.params.id,
      currentUserId
    });
    return apiSuccess(res, activity, 200);
  } catch (err) {
    next(err);
  }
}

async function cancelActivity(req, res, next) {
  try {
    const currentUserId = getAuthUserId(req);
    const activity = await activityService.cancelActivity({
      activityId: req.params.id,
      currentUserId
    });
    return apiSuccess(res, activity, 200);
  } catch (err) {
    next(err);
  }
}

module.exports = {
  listActivities,
  createActivity,
  getActivity,
  updateActivity,
  publishActivity,
  cancelActivity
};
