const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { app } = require('../src/app');

test('returns 404 with standardized error envelope for unknown routes', async () => {
  const response = await request(app)
    .get('/api/unmapped-endpoint-path')
    .expect(404);

  assert.equal(response.body.success, false);
  assert.ok(response.body.error);
  assert.equal(response.body.error.code, 'NOT_FOUND');
  assert.match(response.body.error.message, /Resource not found/);
});

test('handles malformed JSON payload with HTTP 400 and INVALID_JSON code', async () => {
  const response = await request(app)
    .post('/api/health')
    .set('Content-Type', 'application/json')
    .send('{"invalidJson": ')
    .expect(400);

  assert.equal(response.body.success, false);
  assert.ok(response.body.error);
  assert.equal(response.body.error.code, 'INVALID_JSON');
});
