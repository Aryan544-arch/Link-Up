const express = require('express');
const requireAuth = require('../middleware/requireAuth');
const userController = require('../controllers/userController');

const router = express.Router();

router.patch('/me', requireAuth, userController.updateMe);
router.get('/me', requireAuth, userController.getMe);

module.exports = router;
