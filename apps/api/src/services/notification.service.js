const Notification = require('../models/Notification');
const mongoose = require('mongoose');

/**
 * Creates and persists an in-app notification document.
 *
 * @param {object} payload
 * @param {string|mongoose.Types.ObjectId} payload.recipientId
 * @param {string} payload.type
 * @param {string} payload.title
 * @param {string} payload.message
 * @param {string|mongoose.Types.ObjectId} [payload.relatedResourceId]
 * @param {string} [payload.relatedResourceType]
 * @param {object} [payload.metadata]
 * @returns {Promise<object>} Created notification document
 */
async function createNotification(payload) {
  if (!payload || !payload.recipientId) {
    throw new Error('Notification requires a recipientId.');
  }

  if (mongoose.connection && mongoose.connection.readyState !== 1) {
    return null;
  }

  const notification = new Notification({
    recipientId: payload.recipientId,
    type: payload.type,
    title: payload.title,
    message: payload.message,
    relatedResourceId: payload.relatedResourceId || null,
    relatedResourceType: payload.relatedResourceType || 'none',
    metadata: payload.metadata || null
  });

  return notification.save();
}

/**
 * Asynchronously dispatches notification creation in a non-blocking fire-and-forget manner.
 * Ensures marketplace core operations never fail due to notification side-effects.
 *
 * @param {object} payload
 */
function dispatchNotificationAsync(payload) {
  if (mongoose.connection.readyState !== 1) {
    return;
  }

  setImmediate(async () => {
    try {
      await createNotification(payload);
    } catch (err) {
      console.error('[Notification Dispatcher] Failed to persist notification:', err.message);
    }
  });
}

/**
 * Retrieves paginated in-app notifications for an authenticated user.
 *
 * @param {string} userId - Authenticated user ID
 * @param {object} [options]
 * @param {number} [options.page=1]
 * @param {number} [options.limit=20]
 * @param {boolean} [options.unreadOnly=false]
 * @returns {Promise<object>} { items, unreadCount, pagination }
 */
async function getUserNotifications(userId, options = {}) {
  if (!userId) {
    const err = new Error('Authentication required.');
    err.statusCode = 401;
    err.code = 'UNAUTHORIZED';
    throw err;
  }

  const page = Math.max(1, parseInt(options.page, 10) || 1);
  const limit = Math.min(50, Math.max(1, parseInt(options.limit, 10) || 20));
  const skip = (page - 1) * limit;

  const query = { recipientId: userId };
  if (options.unreadOnly === true || options.unreadOnly === 'true') {
    query.readAt = null;
  }

  const [items, total, unreadCount] = await Promise.all([
    Notification.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .exec(),
    Notification.countDocuments(query).exec(),
    Notification.countDocuments({ recipientId: userId, readAt: null }).exec()
  ]);

  const totalPages = Math.ceil(total / limit) || 1;

  return {
    items,
    unreadCount,
    pagination: {
      page,
      limit,
      total,
      totalPages,
      hasNextPage: page < totalPages,
      hasPrevPage: page > 1
    }
  };
}

/**
 * Marks a specific notification as read.
 *
 * @param {string} userId - Authenticated user ID
 * @param {string} notificationId - Notification ID
 * @returns {Promise<object>} Updated notification document
 */
async function markAsRead(userId, notificationId) {
  if (!userId) {
    const err = new Error('Authentication required.');
    err.statusCode = 401;
    err.code = 'UNAUTHORIZED';
    throw err;
  }

  if (!mongoose.Types.ObjectId.isValid(notificationId)) {
    const err = new Error('Invalid notification ID format.');
    err.statusCode = 400;
    err.code = 'INVALID_ID';
    throw err;
  }

  const notification = await Notification.findById(notificationId).exec();
  if (!notification) {
    const err = new Error('Notification not found.');
    err.statusCode = 404;
    err.code = 'NOTIFICATION_NOT_FOUND';
    throw err;
  }

  if (notification.recipientId.toString() !== userId.toString()) {
    const err = new Error('Not authorized to modify this notification.');
    err.statusCode = 403;
    err.code = 'FORBIDDEN';
    throw err;
  }

  if (!notification.readAt) {
    notification.readAt = new Date();
    await notification.save();
  }

  return notification;
}

/**
 * Marks all unread notifications for a user as read.
 *
 * @param {string} userId - Authenticated user ID
 * @returns {Promise<object>} { modifiedCount }
 */
async function markAllAsRead(userId) {
  if (!userId) {
    const err = new Error('Authentication required.');
    err.statusCode = 401;
    err.code = 'UNAUTHORIZED';
    throw err;
  }

  const result = await Notification.updateMany(
    { recipientId: userId, readAt: null },
    { $set: { readAt: new Date() } }
  ).exec();

  return {
    modifiedCount: result.modifiedCount || 0
  };
}

module.exports = {
  createNotification,
  dispatchNotificationAsync,
  getUserNotifications,
  markAsRead,
  markAllAsRead
};
