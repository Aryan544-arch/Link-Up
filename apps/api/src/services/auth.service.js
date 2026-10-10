const User = require('../models/User');

/**
 * Authentication Service — MEETUP Pulse
 *
 * Implements user registration, credential verification, and profile retrieval.
 * Owner: Person 3 (Authentication and AI)
 */

async function registerUser({ email, password, displayName, bio, avatar }) {
  const normalizedEmail = email.toLowerCase().trim();

  const existing = await User.findOne({ email: normalizedEmail }).exec();
  if (existing) {
    const err = new Error('A user with this email address already exists.');
    err.statusCode = 409;
    err.code = 'EMAIL_ALREADY_EXISTS';
    throw err;
  }

  const user = new User({
    email: normalizedEmail,
    password,
    displayName,
    bio: bio || '',
    avatar: avatar || ''
  });

  await user.save();
  return user.toSafeObject();
}

async function loginUser({ email, password }) {
  const normalizedEmail = email.toLowerCase().trim();

  const user = await User.findOne({ email: normalizedEmail }).exec();
  if (!user) {
    const err = new Error('Invalid email or password.');
    err.statusCode = 401;
    err.code = 'INVALID_CREDENTIALS';
    throw err;
  }

  const isMatch = await user.comparePassword(password);
  if (!isMatch) {
    const err = new Error('Invalid email or password.');
    err.statusCode = 401;
    err.code = 'INVALID_CREDENTIALS';
    throw err;
  }

  return user.toSafeObject();
}

async function getUserProfile(userId) {
  if (!userId) {
    const err = new Error('Authentication required.');
    err.statusCode = 401;
    err.code = 'UNAUTHORIZED';
    throw err;
  }

  const user = await User.findById(userId).exec();
  if (!user) {
    const err = new Error('User profile not found.');
    err.statusCode = 404;
    err.code = 'USER_NOT_FOUND';
    throw err;
  }

  return user.toSafeObject();
}

module.exports = {
  registerUser,
  loginUser,
  getUserProfile
};
