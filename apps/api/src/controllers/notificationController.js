const { listNotificationsQuerySchema, notificationIdParamSchema } = require('../validators/notificationValidators');
const notificationService = require('../services/notificationService');

/**
 * List authenticated user's notifications
 * GET /api/notifications
 */
async function list(req, res, next) {
  try {
    const validatedQuery = listNotificationsQuerySchema.parse(req.query);
    const { notifications, meta } = await notificationService.getUserNotifications(req.user.id, validatedQuery);

    res.status(200).json({
      success: true,
      data: notifications.map((n) => n.toPublicJSON()),
      meta
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Get count of unread notifications for authenticated user
 * GET /api/notifications/unread-count
 */
async function getUnreadCount(req, res, next) {
  try {
    const unreadCount = await notificationService.getUnreadCount(req.user.id);

    res.status(200).json({
      success: true,
      data: {
        unreadCount
      }
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Mark a single notification as read
 * PATCH /api/notifications/:id/read
 */
async function markAsRead(req, res, next) {
  try {
    const { id } = notificationIdParamSchema.parse(req.params);
    const updated = await notificationService.markNotificationAsRead(req.user.id, id);

    res.status(200).json({
      success: true,
      data: updated.toPublicJSON()
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Mark all notifications as read for authenticated user
 * PATCH /api/notifications/read-all
 */
async function markAllAsRead(req, res, next) {
  try {
    const result = await notificationService.markAllNotificationsAsRead(req.user.id);

    res.status(200).json({
      success: true,
      data: {
        updatedCount: result.updatedCount
      }
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  list,
  getUnreadCount,
  markAsRead,
  markAllAsRead
};
