const test = require('node:test');
const assert = require('node:assert/strict');
const { loadEnv } = require('../src/config/env');

test('loadEnv validates and applies sensible defaults', () => {
  const env = loadEnv({
    NODE_ENV: 'test',
    PORT: '4000',
    MONGODB_URI: 'mongodb://127.0.0.1:27017/test_db',
    CLIENT_ORIGIN: 'http://localhost:3000'
  });

  assert.equal(env.NODE_ENV, 'test');
  assert.equal(env.PORT, 4000);
  assert.equal(env.MONGODB_URI, 'mongodb://127.0.0.1:27017/test_db');
  assert.equal(env.CLIENT_ORIGIN, 'http://localhost:3000');
});

test('loadEnv rejects invalid NODE_ENV values', () => {
  assert.throws(
    () => {
      loadEnv({
        NODE_ENV: 'invalid-environment'
      });
    },
    /Environment validation failed: NODE_ENV/
  );
});

test('loadEnv rejects negative or invalid PORT numbers', () => {
  assert.throws(
    () => {
      loadEnv({
        PORT: '-10'
      });
    },
    /Environment validation failed: PORT/
  );
});

test('loadEnv validates and accepts comma-separated CLIENT_ORIGIN values', () => {
  const env = loadEnv({
    CLIENT_ORIGIN: 'http://localhost:5173,http://localhost:5175'
  });
  assert.equal(env.CLIENT_ORIGIN, 'http://localhost:5173,http://localhost:5175');
});
