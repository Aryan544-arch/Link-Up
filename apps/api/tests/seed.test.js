const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const { seedDatabase, DEMO_EMAILS, DEMO_PASSWORD } = require('../src/scripts/seed');
const User = require('../src/models/User');
const Activity = require('../src/models/Activity');
const JoinRequest = require('../src/models/JoinRequest');
const InterestRequest = require('../src/models/InterestRequest');
const Proposal = require('../src/models/Proposal');
const Notification = require('../src/models/Notification');
const env = require('../src/config/env');

test('Seed script exports expected constants and function', () => {
  assert.equal(typeof seedDatabase, 'function');
  assert.deepEqual(DEMO_EMAILS, [
    'alice@example.com',
    'bob@example.com',
    'charlie@example.com',
    'dana@example.com'
  ]);
  assert.equal(DEMO_PASSWORD, 'Password123!');
});

test('Seed script populates realistic demo database and verifies password hashes', async () => {
  // Only execute against live MongoDB if connected or connectable
  try {
    const result = await seedDatabase({ silent: true });

    assert.ok(result);
    assert.equal(result.users.length, 4);
    assert.equal(result.activities.length, 4);

    // Verify Alice credentials
    const alice = await User.findOne({ email: 'alice@example.com' }).exec();
    assert.ok(alice);
    const alicePasswordValid = await alice.comparePassword('Password123!');
    assert.equal(alicePasswordValid, true);

    // Verify Bob credentials & plans
    const bob = await User.findOne({ email: 'bob@example.com' }).exec();
    assert.ok(bob);
    const bobPasswordValid = await bob.comparePassword('Password123!');
    assert.equal(bobPasswordValid, true);

    const bobJoinRequests = await JoinRequest.find({ userId: bob._id }).exec();
    assert.equal(bobJoinRequests.length, 2);

    // Verify notifications created
    const aliceNotifs = await Notification.find({ recipientId: alice._id }).exec();
    assert.ok(aliceNotifs.length >= 1);

    const bobNotifs = await Notification.find({ recipientId: bob._id }).exec();
    assert.ok(bobNotifs.length >= 2);
  } catch (err) {
    if (err.message && err.message.includes('ECONNREFUSED')) {
      // Skip if Mongo is not running
      return;
    }
    throw err;
  } finally {
    await mongoose.disconnect();
  }
});
