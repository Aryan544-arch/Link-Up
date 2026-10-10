const authService = require('../services/auth.service');
const { apiSuccess } = require('../utils/apiResponse');
const { getAuthUserId } = require('../middleware/auth.integration');

/**
 * Authentication Controller — MEETUP Pulse
 * Handles registration, login, logout, and current user profile retrieval.
 */

async function register(req, res, next) {
  try {
    const user = await authService.registerUser(req.body);

    if (req.session && typeof req.session.regenerate === 'function') {
      req.session.regenerate((err) => {
        if (err) return next(err);
        req.session.userId = user.id;
        return apiSuccess(res, user, 201);
      });
    } else {
      if (req.session) {
        req.session.userId = user.id;
      }
      return apiSuccess(res, user, 201);
    }
  } catch (err) {
    next(err);
  }
}

async function login(req, res, next) {
  try {
    const user = await authService.loginUser(req.body);

    if (req.session && typeof req.session.regenerate === 'function') {
      req.session.regenerate((err) => {
        if (err) return next(err);
        req.session.userId = user.id;
        return apiSuccess(res, user, 200);
      });
    } else {
      if (req.session) {
        req.session.userId = user.id;
      }
      return apiSuccess(res, user, 200);
    }
  } catch (err) {
    next(err);
  }
}

async function logout(req, res, next) {
  try {
    if (req.session && typeof req.session.destroy === 'function') {
      req.session.destroy((err) => {
        if (err) return next(err);
        res.clearCookie('connect.sid', { path: '/' });
        return apiSuccess(res, { message: 'Logged out successfully' }, 200);
      });
    } else {
      res.clearCookie('connect.sid', { path: '/' });
      return apiSuccess(res, { message: 'Logged out successfully' }, 200);
    }
  } catch (err) {
    next(err);
  }
}

async function getMe(req, res, next) {
  try {
    const userId = getAuthUserId(req);
    const profile = await authService.getUserProfile(userId);
    return apiSuccess(res, profile, 200);
  } catch (err) {
    next(err);
  }
}

module.exports = {
  register,
  login,
  logout,
  getMe
};
