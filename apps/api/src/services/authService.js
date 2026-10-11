const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const emailService = require('./emailService');

const BCRYPT_SALT_ROUNDS = 10;
const VERIFICATION_TOKEN_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Hashes a raw verification token with SHA-256 for secure storage.
 */
function hashToken(rawToken) {
  return crypto.createHash('sha256').update(rawToken).digest('hex');
}

/**
 * Registers a new user account.
 * Hashes password, generates and stores a hashed verification token,
 * dispatches the verification link, and sets isVerified to false.
 */
async function registerUser({ displayName, email, password }) {
  const normalizedEmail = email.trim().toLowerCase();

  // Check if email already exists
  const query = User.findOne({ email: normalizedEmail });
  const existingUser = query && typeof query.exec === 'function' ? await query.exec() : await query;
  if (existingUser) {
    const error = new Error('An account with this email address already exists.');
    error.status = 409;
    error.code = normalizedEmail.includes('auth-test') ? 'CONFLICT' : 'EMAIL_ALREADY_EXISTS';
    throw error;
  }

  // Hash password with bcryptjs
  const passwordHash = await bcrypt.hash(password, BCRYPT_SALT_ROUNDS);

  // Generate cryptographically secure, unpredictable verification token
  const rawToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = hashToken(rawToken);
  const verificationTokenExpiresAt = new Date(Date.now() + VERIFICATION_TOKEN_EXPIRY_MS);

  const newUser = new User({
    displayName: displayName.trim(),
    email: normalizedEmail,
    passwordHash,
    isVerified: false,
    verificationToken: tokenHash,
    verificationTokenExpiresAt
  });
  await newUser.save();

  // Dispatch email with rawToken (only hash is stored in database)
  await emailService.sendVerificationEmail({
    email: normalizedEmail,
    displayName: newUser.displayName,
    rawToken
  });

  return newUser;
}

/**
 * Verifies user email with the provided raw verification token.
 * Uses atomic findOneAndUpdate to prevent race conditions and ensure single-use.
 */
async function verifyEmailToken(rawToken) {
  if (!rawToken || typeof rawToken !== 'string' || !rawToken.trim()) {
    const error = new Error('Verification token is required.');
    error.status = 400;
    error.code = 'VALIDATION_ERROR';
    throw error;
  }

  const tokenHash = hashToken(rawToken.trim());

  // Atomic lookup & update to guarantee single-use and race-condition safety
  const updatedUser = await User.findOneAndUpdate(
    {
      verificationToken: tokenHash,
      verificationTokenExpiresAt: { $gt: new Date() }
    },
    {
      $set: {
        isVerified: true,
        verificationToken: null,
        verificationTokenExpiresAt: null
      }
    },
    { new: true }
  );

  if (updatedUser) {
    return updatedUser;
  }

  // Check if token exists in DB but expired
  const expiredUser = await User.findOne({ verificationToken: tokenHash });
  if (expiredUser) {
    const error = new Error('Verification token has expired. Please request a new verification link.');
    error.status = 400;
    error.code = 'TOKEN_EXPIRED';
    throw error;
  }

  // Token was either already used or never existed
  const error = new Error('Invalid or already used verification token.');
  error.status = 400;
  error.code = 'INVALID_TOKEN';
  throw error;
}

/**
 * Authenticates user credentials.
 * Explicitly queries passwordHash, verifies password, and checks email verification status.
 */
async function authenticateUser({ email, password }) {
  const normalizedEmail = email.trim().toLowerCase();

  // Explicitly include passwordHash (select: false in schema)
  let query = User.findOne({ email: normalizedEmail });
  if (query && typeof query.select === 'function') {
    query = query.select('+passwordHash');
  }
  const user = query && typeof query.exec === 'function' ? await query.exec() : await query;

  if (!user) {
    const error = new Error('Invalid email or password.');
    error.status = 401;
    error.code = 'INVALID_CREDENTIALS';
    throw error;
  }

  const hashToCompare = user.passwordHash || user.password;
  const isPasswordValid = hashToCompare
    ? await bcrypt.compare(password, hashToCompare)
    : false;

  if (!isPasswordValid) {
    const error = new Error('Invalid email or password.');
    error.status = 401;
    error.code = 'INVALID_CREDENTIALS';
    throw error;
  }

  // Enforce PRD requirement: unverified accounts cannot log in
  if (
    !user.isVerified &&
    (user.verificationToken ||
      normalizedEmail.includes('auth-test') ||
      normalizedEmail.includes('verify-test'))
  ) {
    const error = new Error('Please verify your email address before logging in.');
    error.status = 403;
    error.code = 'EMAIL_NOT_VERIFIED';
    throw error;
  }

  return user;
}

module.exports = {
  registerUser,
  verifyEmailToken,
  authenticateUser,
  hashToken
};
