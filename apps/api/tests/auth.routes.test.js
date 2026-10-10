const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { createApp } = require('../src/app');
const User = require('../src/models/User');
const Activity = require('../src/models/Activity');
const JoinRequest = require('../src/models/JoinRequest');
const InterestRequest = require('../src/models/InterestRequest');
const Proposal = require('../src/models/Proposal');

function createQueryMock(data = []) {
  const q = {
    sort: () => q,
    limit: () => q,
    skip: () => q,
    populate: () => q,
    exec: async () => data
  };
  return q;
}

test('POST /api/auth/register creates user and issues session cookie', async () => {
  const app = createApp();
  const userId = new mongoose.Types.ObjectId();
  const origFindOne = User.findOne;
  const origSave = User.prototype.save;

  User.findOne = () => ({
    exec: async () => null // Email is available
  });

  User.prototype.save = async function () {
    this._id = userId;
    return this;
  };

  try {
    const agent = request.agent(app);
    const res = await agent
      .post('/api/auth/register')
      .send({
        email: 'NewRunner@example.com',
        password: 'password123',
        displayName: 'New Runner'
      })
      .expect(201);

    assert.equal(res.body.success, true);
    assert.equal(res.body.data.email, 'newrunner@example.com');
    assert.equal(res.body.data.displayName, 'New Runner');
    assert.equal(res.body.data.password, undefined);

    // Verify session cookie was set
    const cookies = res.headers['set-cookie'];
    assert.ok(cookies);
    assert.ok(cookies.some((c) => c.includes('connect.sid')));
  } finally {
    User.findOne = origFindOne;
    User.prototype.save = origSave;
  }
});

test('POST /api/auth/register rejects duplicate email with 409 EMAIL_ALREADY_EXISTS', async () => {
  const app = createApp();
  const origFindOne = User.findOne;

  User.findOne = () => ({
    exec: async () => ({ _id: new mongoose.Types.ObjectId(), email: 'existing@example.com' })
  });

  try {
    const res = await request(app)
      .post('/api/auth/register')
      .send({
        email: 'Existing@example.com',
        password: 'password123',
        displayName: 'Existing User'
      })
      .expect(409);

    assert.equal(res.body.success, false);
    assert.equal(res.body.error.code, 'EMAIL_ALREADY_EXISTS');
  } finally {
    User.findOne = origFindOne;
  }
});

test('POST /api/auth/register rejects invalid payload with 400 VALIDATION_ERROR', async () => {
  const app = createApp();

  const res = await request(app)
    .post('/api/auth/register')
    .send({
      email: 'not-an-email',
      password: 'short',
      displayName: ''
    })
    .expect(400);

  assert.equal(res.body.success, false);
  assert.equal(res.body.error.code, 'VALIDATION_ERROR');
});

test('POST /api/auth/login validates credentials, rejects invalid attempts, and authenticates', async () => {
  const app = createApp();
  const userId = new mongoose.Types.ObjectId();
  const hashedPassword = await bcrypt.hash('validpassword123', 10);
  const origFindOne = User.findOne;

  const mockUser = new User({
    _id: userId,
    email: 'login@example.com',
    password: hashedPassword,
    displayName: 'Login User'
  });

  try {
    // 1. Nonexistent email fails with 401 INVALID_CREDENTIALS
    User.findOne = () => ({
      exec: async () => null
    });

    const notFoundRes = await request(app)
      .post('/api/auth/login')
      .send({ email: 'unknown@example.com', password: 'validpassword123' })
      .expect(401);

    assert.equal(notFoundRes.body.success, false);
    assert.equal(notFoundRes.body.error.code, 'INVALID_CREDENTIALS');

    // 2. Wrong password fails with 401 INVALID_CREDENTIALS
    User.findOne = () => ({
      exec: async () => mockUser
    });

    const wrongPassRes = await request(app)
      .post('/api/auth/login')
      .send({ email: 'login@example.com', password: 'wrongpassword' })
      .expect(401);

    assert.equal(wrongPassRes.body.success, false);
    assert.equal(wrongPassRes.body.error.code, 'INVALID_CREDENTIALS');

    // 3. Valid credentials succeed with 200 and set-cookie
    const agent = request.agent(app);
    const successRes = await agent
      .post('/api/auth/login')
      .send({ email: 'login@example.com', password: 'validpassword123' })
      .expect(200);

    assert.equal(successRes.body.success, true);
    assert.equal(successRes.body.data.email, 'login@example.com');
    assert.equal(successRes.body.data.password, undefined);

    const cookies = successRes.headers['set-cookie'];
    assert.ok(cookies);
    assert.ok(cookies.some((c) => c.includes('connect.sid')));
  } finally {
    User.findOne = origFindOne;
  }
});

test('GET /api/auth/me returns 401 without session and 200 with session', async () => {
  const app = createApp();
  const userId = new mongoose.Types.ObjectId();
  const hashedPassword = await bcrypt.hash('password123', 10);
  const origFindOne = User.findOne;
  const origFindById = User.findById;

  const mockUser = new User({
    _id: userId,
    email: 'sessionuser@example.com',
    password: hashedPassword,
    displayName: 'Session User',
    bio: 'Profile bio'
  });

  try {
    // 1. Without session -> 401
    const unauthRes = await request(app)
      .get('/api/auth/me')
      .expect(401);

    assert.equal(unauthRes.body.success, false);
    assert.equal(unauthRes.body.error.code, 'UNAUTHORIZED');

    // 2. Login to obtain session
    User.findOne = () => ({
      exec: async () => mockUser
    });
    User.findById = () => ({
      exec: async () => mockUser
    });

    const agent = request.agent(app);
    await agent
      .post('/api/auth/login')
      .send({ email: 'sessionuser@example.com', password: 'password123' })
      .expect(200);

    // 3. Authenticated session fetches /api/auth/me -> 200
    const profileRes = await agent
      .get('/api/auth/me')
      .expect(200);

    assert.equal(profileRes.body.success, true);
    assert.equal(profileRes.body.data.email, 'sessionuser@example.com');
    assert.equal(profileRes.body.data.displayName, 'Session User');
    assert.equal(profileRes.body.data.bio, 'Profile bio');
    assert.equal(profileRes.body.data.password, undefined);
  } finally {
    User.findOne = origFindOne;
    User.findById = origFindById;
  }
});

test('POST /api/auth/logout clears session and subsequent protected requests return 401', async () => {
  const app = createApp();
  const userId = new mongoose.Types.ObjectId();
  const hashedPassword = await bcrypt.hash('password123', 10);
  const origFindOne = User.findOne;
  const origFindById = User.findById;

  const mockUser = new User({
    _id: userId,
    email: 'logoutuser@example.com',
    password: hashedPassword,
    displayName: 'Logout User'
  });

  try {
    User.findOne = () => ({ exec: async () => mockUser });
    User.findById = () => ({ exec: async () => mockUser });

    const agent = request.agent(app);
    await agent
      .post('/api/auth/login')
      .send({ email: 'logoutuser@example.com', password: 'password123' })
      .expect(200);

    // Verify session works
    await agent.get('/api/auth/me').expect(200);

    // Logout
    const logoutRes = await agent.post('/api/auth/logout').expect(200);
    assert.equal(logoutRes.body.success, true);

    // Subsequent call is now 401
    await agent.get('/api/auth/me').expect(401);
  } finally {
    User.findOne = origFindOne;
    User.findById = origFindById;
  }
});

test('Protected GET /api/me/plans returns 200 with authenticated session cookie and 401 without', async () => {
  const app = createApp();
  const userId = new mongoose.Types.ObjectId();
  const hashedPassword = await bcrypt.hash('password123', 10);

  const origFindOne = User.findOne;
  const origFindById = User.findById;
  const origActivityFind = Activity.find;
  const origJoinFind = JoinRequest.find;
  const origInterestFind = InterestRequest.find;
  const origProposalFind = Proposal.find;

  const mockUser = new User({
    _id: userId,
    email: 'plansuser@example.com',
    password: hashedPassword,
    displayName: 'Plans User'
  });

  Activity.find = () => createQueryMock([]);
  JoinRequest.find = () => createQueryMock([]);
  InterestRequest.find = () => createQueryMock([]);
  Proposal.find = () => createQueryMock([]);

  try {
    // 1. Without session cookie -> 401
    const unauthRes = await request(app)
      .get('/api/me/plans')
      .expect(401);

    assert.equal(unauthRes.body.success, false);
    assert.equal(unauthRes.body.error.code, 'UNAUTHORIZED');

    // 2. Login to create session
    User.findOne = () => ({ exec: async () => mockUser });
    User.findById = () => ({ exec: async () => mockUser });

    const agent = request.agent(app);
    await agent
      .post('/api/auth/login')
      .send({ email: 'plansuser@example.com', password: 'password123' })
      .expect(200);

    // 3. Authenticated session calls GET /api/me/plans -> 200 OK
    const authRes = await agent
      .get('/api/me/plans')
      .expect(200);

    assert.equal(authRes.body.success, true);
    assert.ok(authRes.body.data.organized);
    assert.ok(authRes.body.data.joined);
    assert.ok(authRes.body.data.pendingRequests);
    assert.ok(authRes.body.data.interestRequests);
    assert.ok(authRes.body.data.proposals);
    assert.ok(authRes.body.data.summary);
    assert.equal(authRes.body.data.summary.totalPlansCount, 0);
  } finally {
    User.findOne = origFindOne;
    User.findById = origFindById;
    Activity.find = origActivityFind;
    JoinRequest.find = origJoinFind;
    InterestRequest.find = origInterestFind;
    Proposal.find = origProposalFind;
  }
});
