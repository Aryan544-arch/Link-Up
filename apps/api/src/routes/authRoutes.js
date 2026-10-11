const express = require('express');
const { authLimiter } = require('../middleware/rateLimiter');
const requireAuth = require('../middleware/requireAuth');
const authController = require('../controllers/authController');

const router = express.Router();

router.post('/register', authLimiter, authController.register);
router.post('/login', authLimiter, authController.login);
router.get('/verify-email', authController.verifyEmail);
router.post('/verify-email', authController.verifyEmail);
router.post('/logout', requireAuth, authController.logout);
router.get('/me', requireAuth, authController.getCurrentUser);

module.exports = router;
