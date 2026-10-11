const mongoose = require('mongoose');
const Notification = require('../models/Notification');
const { NOTIFICATION_TYPES } = require('../models/Notification');

/**
 * Creates and persists an in-app notification.
 * Designed as a reusable service method for Person 2's activity & join-request workflows.
 *
 * Supports idempotency: If a deduplicationKey is provided and a record exists,
 * returns the existing notification instead of creating duplicates on workflow retries.
 *
 * @param {Object} options
 * @param {string|ObjectId} options.recipientId - ID of recipient user (required)
 * @param {string} options.type - Notification type enum (required)
 * @param {string} options.title - Short notification title (required)
 * @param {string} options.message - Detailed notification message (required)
 * @param {string} [options.relatedResourceType] - Resource type ('activity', 'join_request', etc.)
 * @param {string|ObjectId} [options.relatedResourceId] - Resource ID
 * @param {string} [options.deduplicationKey] - Optional idempotency key
 * @returns {Promise<Object>} Created or existing Notification document
 */
async function createNotification({
  recipientId,
  type,
  title,
  message,
  relatedResourceType = null,
  relatedResourceId = null,
  deduplicationKey = null
}) {
  if (!recipientId) {
    const error = new Error('Recipient ID is required to create a notification.');
    error.status = 400;
    error.code = 'VALIDATION_ERROR';
    throw error;
  }

  if (!title || typeof title !== 'string' || !title.trim()) {
    const error = new Error('Notification title is required.');
    error.status = 400;
    error.code = 'VALIDATION_ERROR';
    throw error;
  }

  if (!message || typeof message !== 'string' || !message.trim()) {
    const error = new Error('Notification message is required.');
    error.status = 400;
    error.code = 'VALIDATION_ERROR';
    throw error;
  }

  if (!NOTIFICATION_TYPES.includes(type)) {
    const error = new Error(`Invalid notification type: ${type}`);
    error.status = 400;
    error.code = 'VALIDATION_ERROR';
    throw error;
  }

  // Handle idempotency check
  if (deduplicationKey) {
    const existing = await Notification.findOne({ deduplicationKey });
    if (existing) {
      return existing;
    }
  }

  const payload = {
    recipientId: new mongoose.Types.ObjectId(recipientId.toString()),
    type,
    title: title.trim(),
    message: message.trim(),
    relatedResourceType: relatedResourceType || null,
    relatedResourceId: relatedResourceId ? new mongoose.Types.ObjectId(relatedResourceId.toString()) : null
  };

  if (deduplicationKey) {
    payload.deduplicationKey = deduplicationKey;
  }

  try {
    const notification = await Notification.create(payload);
    return notification;
  } catch (err) {
    // If concurrent race condition on unique deduplicationKey occurs, return existing
    if (deduplicationKey && err.code === 11000) {
      const existing = await Notification.findOne({ deduplicationKey });
      if (existing) {
        return existing;
      }
    }
    throw err;
  }
}

/**
 * Lists notifications for the authenticated user with pagination and newest-first ordering.
 * Never allows viewing another user's notifications.
 */
async function getUserNotifications(userId, { page = 1, limit = 20, unreadOnly = false } = {}) {
  const safePage = Math.max(1, parseInt(page, 10) || 1);
  const safeLimit = Math.min(50, Math.max(1, parseInt(limit, 10) || 20));
  const skip = (safePage - 1) * safeLimit;

  const query = {
    recipientId: new mongoose.Types.ObjectId(userId.toString())
  };

  if (unreadOnly) {
    query.readAt = null;
  }

  const [notifications, total, unreadCount] = await Promise.all([
    Notification.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(safeLimit),
    Notification.countDocuments(query),
    Notification.countDocuments({
      recipientId: new mongoose.Types.ObjectId(userId.toString()),
      readAt: null
    })
  ]);

  return {
    notifications,
    meta: {
      page: safePage,
      limit: safeLimit,
      total,
      unreadCount,
      totalPages: Math.ceil(total / safeLimit) || 1
    }
  };
}

/**
 * Returns count of unread notifications for the user.
 */
async function getUnreadCount(userId) {
  const unreadCount = await Notification.countDocuments({
    recipientId: new mongoose.Types.ObjectId(userId.toString()),
    readAt: null
  });

  return unreadCount;
}

/**
 * Marks a specific notification as read, ensuring ownership by userId.
 * Returns 404 if notification does not exist or belongs to another user.
 */
async function markNotificationAsRead(userId, notificationId) {
  if (!mongoose.Types.ObjectId.isValid(notificationId)) {
    const error = new Error('Invalid notification ID format.');
    error.status = 400;
    error.code = 'VALIDATION_ERROR';
    throw error;
  }

  const notification = await Notification.findOne({
    _id: new mongoose.Types.ObjectId(notificationId.toString()),
    recipientId: new mongoose.Types.ObjectId(userId.toString())
  });

  if (!notification) {
    const error = new Error('Notification not found.');
    error.status = 404;
    error.code = 'NOT_FOUND';
    throw error;
  }

  if (!notification.readAt) {
    notification.readAt = new Date();
    await notification.save();
  }

  return notification;
}

/**
 * Marks all unread notifications for a user as read.
 */
async function markAllNotificationsAsRead(userId) {
  const result = await Notification.updateMany(
    {
      recipientId: new mongoose.Types.ObjectId(userId.toString()),
      readAt: null
    },
    {
      $set: { readAt: new Date() }
    }
  );

  return {
    updatedCount: result.modifiedCount
  };
}

module.exports = {
  createNotification,
  getUserNotifications,
  getUnreadCount,
  markNotificationAsRead,
  markAllNotificationsAsRead
};
