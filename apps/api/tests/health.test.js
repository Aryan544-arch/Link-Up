const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { app } = require('../src/app');

test('GET /api/health returns HTTP 200 and truthful status', async () => {
  const response = await request(app)
    .get('/api/health')
    .expect(200);

  assert.equal(response.body.success, true);
  assert.ok(response.body.data);
  assert.equal(response.body.data.service, 'meetup-pulse-api');
  assert.ok(['ok', 'degraded'].includes(response.body.data.status));
  assert.ok(typeof response.body.data.uptimeSeconds === 'number');
  assert.ok(response.body.data.timestamp);

  // Verifies database status object without mocking fake connection
  assert.ok(response.body.data.database);
  assert.ok(typeof response.body.data.database.status === 'string');
  assert.ok(typeof response.body.data.database.readyState === 'number');
});
