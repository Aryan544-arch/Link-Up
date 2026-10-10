const profileService = require('../services/profile.service');
const { apiSuccess } = require('../utils/apiResponse');
const { getAuthUserId } = require('../middleware/auth.integration');

async function updateProfile(req, res, next) {
  try {
    const userId = getAuthUserId(req);
    const updatedUser = await profileService.updateProfile(userId, req.body);
    return apiSuccess(res, updatedUser);
  } catch (err) {
    next(err);
  }
}

async function getPreferences(req, res, next) {
  try {
    const userId = getAuthUserId(req);
    const preferences = await profileService.getPreferences(userId);
    return apiSuccess(res, preferences);
  } catch (err) {
    next(err);
  }
}

async function updatePreferences(req, res, next) {
  try {
    const userId = getAuthUserId(req);
    const updatedPreferences = await profileService.updatePreferences(userId, req.body);
    return apiSuccess(res, updatedPreferences);
  } catch (err) {
    next(err);
  }
}

module.exports = {
  updateProfile,
  getPreferences,
  updatePreferences
};
