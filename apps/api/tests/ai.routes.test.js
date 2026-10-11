const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { createApp } = require('../src/app');
const aiService = require('../src/services/ai.service');
const { env } = require('../src/config/env');
const { ACTIVITY_CATEGORIES } = require('../src/constants/activity.constants');

const mockUser = {
  id: '6acab79523b6da3e5f167659',
  _id: '6acab79523b6da3e5f167659',
  email: 'planner@example.com',
  displayName: 'Activity Planner'
};

function createTestAppWithAuth() {
  const authMiddleware = (req, res, next) => {
    req.user = { ...mockUser };
    next();
  };
  return createApp({ authMiddleware });
}

test('GET /api/ai/status returns AI configuration status', async () => {
  const app = createApp();

  const res = await request(app)
    .get('/api/ai/status')
    .expect(200);

  assert.equal(res.body.success, true);
  assert.equal(typeof res.body.data.enabled, 'boolean');
  assert.ok(res.body.data.model);
  assert.ok(res.body.data.provider);
});

test('POST /api/ai/plan-activity returns 401 UNAUTHORIZED when unauthenticated', async () => {
  const app = createApp();

  const res = await request(app)
    .post('/api/ai/plan-activity')
    .send({
      category: 'fitness',
      prompt: 'Morning park run'
    })
    .expect(401);

  assert.equal(res.body.success, false);
  assert.equal(res.body.error.code, 'UNAUTHORIZED');
});

test('POST /api/ai/plan-activity rejects invalid category with 400 VALIDATION_ERROR', async () => {
  const app = createTestAppWithAuth();

  const res = await request(app)
    .post('/api/ai/plan-activity')
    .send({
      category: 'invalid_category_xyz'
    })
    .expect(400);

  assert.equal(res.body.success, false);
  assert.equal(res.body.error.code, 'VALIDATION_ERROR');
});

test('POST /api/ai/plan-activity rejects out-of-bounds groupSize with 400 VALIDATION_ERROR', async () => {
  const app = createTestAppWithAuth();

  const res = await request(app)
    .post('/api/ai/plan-activity')
    .send({
      category: 'outdoor',
      groupSize: 1 // Minimum is 2
    })
    .expect(400);

  assert.equal(res.body.success, false);
  assert.equal(res.body.error.code, 'VALIDATION_ERROR');
});

test('POST /api/ai/plan-activity generates deterministic plan in fallback mode when API key is empty', async () => {
  const app = createTestAppWithAuth();

  const res = await request(app)
    .post('/api/ai/plan-activity')
    .send({
      category: 'fitness',
      prompt: 'Casual morning loop for newcomers',
      displayArea: 'Prospect Park, Brooklyn',
      skillLevel: 'beginner',
      groupSize: 8,
      budget: 0
    })
    .expect(200);

  assert.equal(res.body.success, true);
  const data = res.body.data;
  assert.equal(data.source, 'fallback');
  assert.ok(data.disclaimer);

  const suggestion = data.suggestion;
  assert.ok(suggestion.title.includes('Casual morning loop'));
  assert.equal(suggestion.category, 'fitness');
  assert.equal(suggestion.skillLevel, 'beginner');
  assert.equal(suggestion.capacity, 8);
  assert.equal(suggestion.budget, 0);
  assert.equal(suggestion.displayArea, 'Prospect Park, Brooklyn');
  assert.ok(Array.isArray(suggestion.checklist));
  assert.ok(suggestion.checklist.length >= 3);
  assert.ok(Array.isArray(suggestion.safetyTips));
  assert.ok(suggestion.safetyTips.length >= 2);
});

test('POST /api/ai/plan-activity generates fallback templates for all supported categories', async () => {
  const app = createTestAppWithAuth();

  for (const cat of ACTIVITY_CATEGORIES) {
    const res = await request(app)
      .post('/api/ai/plan-activity')
      .send({ category: cat })
      .expect(200);

    assert.equal(res.body.success, true);
    assert.equal(res.body.data.suggestion.category, cat);
    assert.ok(res.body.data.suggestion.title);
    assert.ok(res.body.data.suggestion.description);
    assert.ok(res.body.data.suggestion.checklist.length > 0);
  }
});

test('POST /api/ai/plan-activity parses LLM response correctly when provider call succeeds', async () => {
  const app = createTestAppWithAuth();

  // Mock global.fetch to simulate successful Gemini response
  const originalFetch = global.fetch;
  const mockGeminiOutput = {
    candidates: [
      {
        content: {
          parts: [
            {
              text: JSON.stringify({
                title: 'Sunrise Riverside Calisthenics',
                description: 'Guided bodyweight workout along the pier with progressive movements.',
                category: 'fitness',
                skillLevel: 'intermediate',
                capacity: 10,
                budget: 0,
                suggestedDurationMinutes: 75,
                displayArea: 'Pier 25, Hudson River',
                checklist: ['Athletic clothes', 'Water bottle', 'Resistance bands'],
                safetyTips: ['Warm up joints thoroughly', 'Stay clear of wet pier edges']
              })
            }
          ]
        }
      }
    ]
  };

  global.fetch = async () => ({
    ok: true,
    json: async () => mockGeminiOutput
  });

  // Temporarily set AI_PROVIDER_API_KEY
  const originalKey = process.env.AI_PROVIDER_API_KEY;
  process.env.AI_PROVIDER_API_KEY = 'test-mock-gemini-key';

  try {
    const res = await request(app)
      .post('/api/ai/plan-activity')
      .send({
        category: 'fitness',
        prompt: 'Calisthenics workout by the river'
      })
      .expect(200);

    assert.equal(res.body.success, true);
    assert.equal(res.body.data.source, 'ai');
    assert.equal(res.body.data.suggestion.title, 'Sunrise Riverside Calisthenics');
    assert.equal(res.body.data.suggestion.category, 'fitness');
    assert.equal(res.body.data.suggestion.capacity, 10);
    assert.deepEqual(res.body.data.suggestion.checklist, [
      'Athletic clothes',
      'Water bottle',
      'Resistance bands'
    ]);
  } finally {
    global.fetch = originalFetch;
    if (originalKey === undefined) {
      delete process.env.AI_PROVIDER_API_KEY;
    } else {
      process.env.AI_PROVIDER_API_KEY = originalKey;
    }
  }
});

test('POST /api/ai/plan-activity falls back gracefully without crashing when LLM call throws or times out', async () => {
  const app = createTestAppWithAuth();

  // Mock global.fetch to simulate network failure / timeout
  const originalFetch = global.fetch;
  global.fetch = async () => {
    throw new Error('ETIMEDOUT: Connection to generativelanguage.googleapis.com timed out');
  };

  const originalKey = process.env.AI_PROVIDER_API_KEY;
  process.env.AI_PROVIDER_API_KEY = 'test-mock-gemini-key';

  try {
    const res = await request(app)
      .post('/api/ai/plan-activity')
      .send({
        category: 'outdoor',
        prompt: 'Trail walk'
      })
      .expect(200); // Must not return 500!

    assert.equal(res.body.success, true);
    assert.equal(res.body.data.source, 'fallback');
    assert.ok(res.body.data.errorDetails);
    assert.ok(res.body.data.suggestion.title);
  } finally {
    global.fetch = originalFetch;
    if (originalKey === undefined) {
      delete process.env.AI_PROVIDER_API_KEY;
    } else {
      process.env.AI_PROVIDER_API_KEY = originalKey;
    }
  }
});
