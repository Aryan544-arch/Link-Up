const User = require('../models/User');

/**
 * Updates authenticated user's profile details.
 *
 * @param {string} userId - Authenticated user's ID
 * @param {object} updateData - Profile fields to update
 * @returns {Promise<object>} Safe user profile object
 */
async function updateProfile(userId, updateData) {
  if (!userId) {
    const err = new Error('Authentication required.');
    err.statusCode = 401;
    err.code = 'UNAUTHORIZED';
    throw err;
  }

  const user = await User.findById(userId).exec();
  if (!user) {
    const err = new Error('User not found.');
    err.statusCode = 404;
    err.code = 'USER_NOT_FOUND';
    throw err;
  }

  if (updateData.displayName !== undefined) user.displayName = updateData.displayName;
  if (updateData.bio !== undefined) user.bio = updateData.bio;
  if (updateData.avatar !== undefined) user.avatar = updateData.avatar;
  if (updateData.phoneNumber !== undefined) user.phoneNumber = updateData.phoneNumber;
  if (updateData.gender !== undefined) user.gender = updateData.gender;

  await user.save();
  return user.toSafeObject();
}

/**
 * Gets authenticated user's preferences.
 *
 * @param {string} userId - Authenticated user's ID
 * @returns {Promise<object>} User preferences object
 */
async function getPreferences(userId) {
  if (!userId) {
    const err = new Error('Authentication required.');
    err.statusCode = 401;
    err.code = 'UNAUTHORIZED';
    throw err;
  }

  const user = await User.findById(userId).exec();
  if (!user) {
    const err = new Error('User not found.');
    err.statusCode = 404;
    err.code = 'USER_NOT_FOUND';
    throw err;
  }

  return {
    interests: user.interests || [],
    searchRadiusKm: user.searchRadiusKm ?? 3,
    preferredLocation: user.preferredLocation || { displayArea: '', coordinates: null },
    notificationPreferences: user.notificationPreferences || { inApp: true, email: false, push: false }
  };
}

/**
 * Updates authenticated user's preferences.
 *
 * @param {string} userId - Authenticated user's ID
 * @param {object} updateData - Preferences to update
 * @returns {Promise<object>} Updated preferences object
 */
async function updatePreferences(userId, updateData) {
  if (!userId) {
    const err = new Error('Authentication required.');
    err.statusCode = 401;
    err.code = 'UNAUTHORIZED';
    throw err;
  }

  const user = await User.findById(userId).exec();
  if (!user) {
    const err = new Error('User not found.');
    err.statusCode = 404;
    err.code = 'USER_NOT_FOUND';
    throw err;
  }

  if (updateData.interests !== undefined) {
    user.interests = updateData.interests;
  }

  if (updateData.searchRadiusKm !== undefined) {
    user.searchRadiusKm = updateData.searchRadiusKm;
  }

  if (updateData.preferredLocation !== undefined) {
    user.preferredLocation = updateData.preferredLocation;
  } else if (updateData.preferredArea !== undefined) {
    const currentCoords = user.preferredLocation?.coordinates || null;
    user.preferredLocation = {
      displayArea: updateData.preferredArea,
      coordinates: currentCoords
    };
  }

  if (updateData.notificationPreferences !== undefined) {
    const currentNotif = user.notificationPreferences ? (user.notificationPreferences.toObject ? user.notificationPreferences.toObject() : user.notificationPreferences) : {};
    user.notificationPreferences = {
      ...currentNotif,
      ...updateData.notificationPreferences
    };
  }

  await user.save();

  return {
    interests: user.interests || [],
    searchRadiusKm: user.searchRadiusKm ?? 3,
    preferredLocation: user.preferredLocation || { displayArea: '', coordinates: null },
    notificationPreferences: user.notificationPreferences || { inApp: true, email: false, push: false }
  };
}

module.exports = {
  updateProfile,
  getPreferences,
  updatePreferences
};
