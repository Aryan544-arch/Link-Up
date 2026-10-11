const express = require('express');
const requireAuth = require('../middleware/requireAuth');
const notificationController = require('../controllers/notificationController');

const router = express.Router();

// All notification routes require authentication
router.use(requireAuth);

router.get('/', notificationController.list);
router.get('/unread-count', notificationController.getUnreadCount);
router.patch('/read-all', notificationController.markAllAsRead);
router.patch('/:id/read', notificationController.markAsRead);

module.exports = router;
