const express = require('express');
const notificationController = require('../controllers/notification.controller');
const { requireAuth: defaultRequireAuth } = require('../middleware/auth.integration');

/**
 * Router factory for /api/notifications endpoints.
 *
 * @param {object} options
 * @param {Function} [options.authMiddleware] - Optional auth middleware override for testing
 * @returns {express.Router}
 */
function createNotificationRouter(options = {}) {
  const router = express.Router();
  const requireAuth = options.authMiddleware || defaultRequireAuth;

  router.get('/', requireAuth, notificationController.getNotifications);
  router.get('/unread-count', requireAuth, notificationController.getUnreadCount);
  router.patch('/read-all', requireAuth, notificationController.markAllRead);
  router.patch('/:id/read', requireAuth, notificationController.markRead);

  return router;
}

module.exports = {
  createNotificationRouter
};
