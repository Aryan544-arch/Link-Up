const notificationService = require('../services/notification.service');
const { apiSuccess } = require('../utils/apiResponse');
const { getAuthUserId } = require('../middleware/auth.integration');

async function getNotifications(req, res, next) {
  try {
    const userId = getAuthUserId(req);
    const result = await notificationService.getUserNotifications(userId, req.query);
    return apiSuccess(res, result);
  } catch (err) {
    next(err);
  }
}

async function markRead(req, res, next) {
  try {
    const userId = getAuthUserId(req);
    const updated = await notificationService.markAsRead(userId, req.params.id);
    return apiSuccess(res, updated);
  } catch (err) {
    next(err);
  }
}

async function markAllRead(req, res, next) {
  try {
    const userId = getAuthUserId(req);
    const result = await notificationService.markAllAsRead(userId);
    return apiSuccess(res, result);
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getNotifications,
  markRead,
  markAllRead
};
