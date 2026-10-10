const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const User = require('../src/models/User');

test('User model imports cleanly without a live MongoDB connection', () => {
  assert.ok(User);
  assert.equal(User.modelName, 'User');
});

test('Valid User document passes schema validation and excludes password in toSafeObject', async () => {
  const user = new User({
    email: 'TestUser@example.com',
    password: 'securepassword123',
    displayName: 'Test Runner',
    bio: 'Avid marathoner'
  });

  const validationError = user.validateSync();
  assert.equal(validationError, undefined);

  assert.equal(user.email, 'testuser@example.com'); // Lowercase transform
  assert.equal(user.displayName, 'Test Runner');

  const safe = user.toSafeObject();
  assert.equal(safe.email, 'testuser@example.com');
  assert.equal(safe.displayName, 'Test Runner');
  assert.equal(safe.bio, 'Avid marathoner');
  assert.equal(safe.password, undefined);
  assert.ok(safe.id);
  assert.ok(safe._id);
});

test('User model fails validation when required fields are missing', () => {
  const emptyUser = new User({});
  const err = emptyUser.validateSync();
  assert.ok(err);
  assert.ok(err.errors.email);
  assert.ok(err.errors.password);
  assert.ok(err.errors.displayName);
});

test('User model rejects invalid email format', () => {
  const invalidUser = new User({
    email: 'not-an-email',
    password: 'validpassword123',
    displayName: 'Invalid Email User'
  });

  const err = invalidUser.validateSync();
  assert.ok(err);
  assert.ok(err.errors.email);
});

test('User model rejects password shorter than 8 characters', () => {
  const shortPassUser = new User({
    email: 'shortpass@example.com',
    password: 'short',
    displayName: 'Short Password'
  });

  const err = shortPassUser.validateSync();
  assert.ok(err);
  assert.ok(err.errors.password);
});

test('User.comparePassword correctly verifies password matches', async () => {
  const user = new User({
    email: 'verify@example.com',
    password: 'plainpassword123',
    displayName: 'Password Verifier'
  });

  // Trigger password hashing
  const bcrypt = require('bcryptjs');
  user.password = await bcrypt.hash('plainpassword123', 10);

  const isMatch = await user.comparePassword('plainpassword123');
  assert.equal(isMatch, true);

  const isMismatch = await user.comparePassword('wrongpassword');
  assert.equal(isMismatch, false);
});
