process.env.NODE_ENV = 'test';
const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { connectDB, disconnectDB } = require('../src/config/db');
const User = require('../src/models/User');
const { toPublicUser } = require('../src/utils/userSerializer');

describe('MEETUP Pulse — Shared User Model', () => {
  before(async () => {
    await connectDB();
  });

  after(async () => {
    await User.deleteMany({ email: { $regex: /@test\.example\.com$/i } });
    await disconnectDB();
  });

  beforeEach(async () => {
    await User.deleteMany({ email: { $regex: /@test\.example\.com$/i } });
  });

  it('Default values are set correctly when optional fields are omitted', async () => {
    const user = new User({
      displayName: 'Alice Walker',
      email: 'alice.defaults@test.example.com',
      passwordHash: 'hashed_password_123'
    });

    await user.save();

    assert.equal(user.isVerified, false);
    assert.equal(user.searchRadiusKm, 3);
    assert.equal(user.preferredArea, null);
    assert.deepEqual(user.interests, []);
    assert.equal(user.verificationToken, null);
    assert.equal(user.verificationTokenExpiresAt, null);
    assert.ok(user.createdAt instanceof Date);
    assert.ok(user.updatedAt instanceof Date);
  });

  it('Required fields validation fails if missing', async () => {
    // Missing all required fields
    const emptyUser = new User({});
    await assert.rejects(async () => {
      await emptyUser.validate();
    }, /Display name is required/);

    // Missing email
    const noEmail = new User({
      displayName: 'Bob',
      passwordHash: 'hash123'
    });
    await assert.rejects(async () => {
      await noEmail.validate();
    }, /Email is required/);

    // Missing passwordHash
    const noPassword = new User({
      displayName: 'Bob',
      email: 'bob@test.example.com'
    });
    await assert.rejects(async () => {
      await noPassword.validate();
    }, /Password hash is required/);
  });

  it('Display name constraints enforce length and trimming', async () => {
    // Too short (< 2 chars)
    const tooShort = new User({
      displayName: 'A',
      email: 'short@test.example.com',
      passwordHash: 'hash123'
    });
    await assert.rejects(async () => {
      await tooShort.validate();
    }, /at least 2 characters/);

    // Too long (> 50 chars)
    const tooLong = new User({
      displayName: 'A'.repeat(51),
      email: 'long@test.example.com',
      passwordHash: 'hash123'
    });
    await assert.rejects(async () => {
      await tooLong.validate();
    }, /cannot exceed 50 characters/);

    // Trimming leading and trailing spaces
    const trimmedUser = new User({
      displayName: '   Charlie Brown   ',
      email: 'charlie@test.example.com',
      passwordHash: 'hash123'
    });
    await trimmedUser.validate();
    assert.equal(trimmedUser.displayName, 'Charlie Brown');
  });

  it('Email is normalized to lowercase and trimmed; invalid formats rejected', async () => {
    const user = new User({
      displayName: 'Diana Prince',
      email: '  DIANA.Prince@TEST.example.com   ',
      passwordHash: 'hash123'
    });
    await user.save();

    assert.equal(user.email, 'diana.prince@test.example.com');

    // Invalid email format
    const invalidEmail = new User({
      displayName: 'Diana',
      email: 'not-a-valid-email',
      passwordHash: 'hash123'
    });
    await assert.rejects(async () => {
      await invalidEmail.validate();
    }, /valid email address/);
  });

  it('Duplicate email addresses are rejected by unique index', async () => {
    const user1 = new User({
      displayName: 'User One',
      email: 'duplicate@test.example.com',
      passwordHash: 'hash123'
    });
    await user1.save();

    const user2 = new User({
      displayName: 'User Two',
      email: 'DUPLICATE@test.example.com',
      passwordHash: 'hash456'
    });

    await assert.rejects(async () => {
      await user2.save();
    }, /duplicate key/);
  });

  it('Search radius constraints enforce minimum (0.5 km) and maximum (50 km)', async () => {
    // Below minimum
    const belowMin = new User({
      displayName: 'Radius Test',
      email: 'radius.below@test.example.com',
      passwordHash: 'hash123',
      searchRadiusKm: 0.2
    });
    await assert.rejects(async () => {
      await belowMin.validate();
    }, /at least 0\.5 km/);

    // Above maximum
    const aboveMax = new User({
      displayName: 'Radius Test',
      email: 'radius.above@test.example.com',
      passwordHash: 'hash123',
      searchRadiusKm: 55
    });
    await assert.rejects(async () => {
      await aboveMax.validate();
    }, /cannot exceed 50 km/);

    // Valid radius succeeds
    const validRadius = new User({
      displayName: 'Radius Test',
      email: 'radius.valid@test.example.com',
      passwordHash: 'hash123',
      searchRadiusKm: 12.5
    });
    await validRadius.validate();
    assert.equal(validRadius.searchRadiusKm, 12.5);
  });

  it('Password hash and verification tokens are excluded from default query results', async () => {
    const created = await User.create({
      displayName: 'Secret Test',
      email: 'secrets@test.example.com',
      passwordHash: 'super_secret_hash_value',
      verificationToken: 'token_xyz_secret',
      verificationTokenExpiresAt: new Date(Date.now() + 3600000)
    });

    // Query back from database without explicit select
    const fetched = await User.findById(created._id).lean();

    assert.equal(fetched.passwordHash, undefined);
    assert.equal(fetched.verificationToken, undefined);
    assert.equal(fetched.verificationTokenExpiresAt, undefined);

    // Can be retrieved explicitly when needed for auth checks
    const authFetched = await User.findById(created._id).select('+passwordHash +verificationToken');
    assert.equal(authFetched.passwordHash, 'super_secret_hash_value');
    assert.equal(authFetched.verificationToken, 'token_xyz_secret');
  });

  it('Public serialization (.toPublicJSON and toPublicUser) omits sensitive fields', async () => {
    const user = await User.create({
      displayName: 'Public Persona',
      email: 'public@test.example.com',
      passwordHash: 'sensitive_hash',
      verificationToken: 'sensitive_token',
      interests: ['hiking', 'badminton'],
      preferredArea: 'Sector 14'
    });

    // Explicitly select secrets to test that serializer still protects them
    const userWithSecrets = await User.findById(user._id).select('+passwordHash +verificationToken');

    const publicJson = userWithSecrets.toPublicJSON();

    assert.equal(publicJson.id, user._id.toString());
    assert.equal(publicJson.displayName, 'Public Persona');
    assert.equal(publicJson.email, 'public@test.example.com');
    assert.equal(publicJson.preferredArea, 'Sector 14');
    assert.deepEqual(publicJson.interests, ['hiking', 'badminton']);
    assert.equal(publicJson.passwordHash, undefined);
    assert.equal(publicJson.verificationToken, undefined);
    assert.equal(publicJson.verificationTokenExpiresAt, undefined);

    // Test standalone helper toPublicUser
    const serializedViaHelper = toPublicUser(userWithSecrets);
    assert.deepEqual(serializedViaHelper, publicJson);

    // JSON.stringify also omits secrets due to schema toJSON transform
    const rawJsonString = JSON.stringify(userWithSecrets);
    assert.ok(!rawJsonString.includes('sensitive_hash'));
    assert.ok(!rawJsonString.includes('sensitive_token'));
  });
});
