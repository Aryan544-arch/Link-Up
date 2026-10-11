import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { apiClient, normalizeApiError } from '../lib/api.js';
import {
  getCurrentUserRequest,
  loginRequest,
  logoutRequest,
  registerRequest,
  verifyEmailRequest,
  extractUserData
} from '../lib/authApi.js';

describe('MEETUP Pulse — Web Auth Client & Session Suite', () => {
  let capturedRequests = [];

  beforeEach(() => {
    capturedRequests = [];
  });

  describe('Axios Client Configuration & Cookie Persistence', () => {
    it('apiClient is configured with withCredentials: true for cross-origin session cookies', () => {
      assert.equal(apiClient.defaults.withCredentials, true);
    });

    it('apiClient includes standard JSON headers', () => {
      assert.equal(apiClient.defaults.headers['Content-Type'], 'application/json');
      assert.equal(apiClient.defaults.headers['Accept'], 'application/json');
    });
  });

  describe('Initial Unauthenticated Loading (GET /api/auth/me -> 401)', () => {
    it('handles 401 on initial session check by recognizing isUnauthorized and leaving user null', async () => {
      const originalGet = apiClient.get;
      apiClient.get = async (url) => {
        capturedRequests.push({ method: 'GET', url });
        const error = new Error('Request failed with status code 401');
        error.response = {
          status: 401,
          data: {
            success: false,
            error: {
              code: 'UNAUTHORIZED',
              message: 'Authentication required. Please log in.'
            }
          }
        };
        throw error;
      };

      try {
        let authUser = 'initial-placeholder';
        let authStatus = 'CHECKING';
        let authError = null;

        try {
          const response = await getCurrentUserRequest();
          authUser = extractUserData(response);
          authStatus = 'AUTHENTICATED';
        } catch (err) {
          const normalized = err.normalized || normalizeApiError(err);
          if (normalized.isUnauthorized) {
            authUser = null;
            authStatus = 'UNAUTHENTICATED';
            authError = null;
          }
        }

        assert.equal(capturedRequests.length, 1);
        assert.equal(capturedRequests[0].url, '/api/auth/me');
        assert.equal(authUser, null, 'User must be null on 401');
        assert.equal(authStatus, 'UNAUTHENTICATED', 'Status must transition to UNAUTHENTICATED on 401');
        assert.equal(authError, null, 'No error banner should be shown for regular unauthenticated visitors');
      } finally {
        apiClient.get = originalGet;
      }
    });

    it('distinguishes server network errors from 401 unauthenticated without logging user out', async () => {
      const originalGet = apiClient.get;
      apiClient.get = async (url) => {
        capturedRequests.push({ method: 'GET', url });
        const error = new Error('connect ECONNREFUSED 127.0.0.1:3000');
        throw error;
      };

      try {
        let authStatus = 'CHECKING';
        let authError = null;

        try {
          await getCurrentUserRequest();
          authStatus = 'AUTHENTICATED';
        } catch (err) {
          const normalized = err.normalized || normalizeApiError(err);
          if (normalized.isUnauthorized) {
            authStatus = 'UNAUTHENTICATED';
          } else if (normalized.isNetworkError || normalized.status >= 500) {
            authStatus = 'UNAVAILABLE';
            authError = normalized;
          }
        }

        assert.equal(authStatus, 'UNAVAILABLE', 'Network failure must set UNAVAILABLE, not UNAUTHENTICATED');
        assert.ok(authError.isNetworkError);
      } finally {
        apiClient.get = originalGet;
      }
    });
  });

  describe('Successful Login (POST /api/auth/login)', () => {
    it('dispatches login credentials and extracts user profile from { success: true, data: user } envelope', async () => {
      const originalPost = apiClient.post;
      apiClient.post = async (url, payload) => {
        capturedRequests.push({ method: 'POST', url, payload });
        return {
          status: 200,
          data: {
            success: true,
            data: {
              id: 'user_abc123',
              email: 'explorer@example.com',
              displayName: 'Jane Explorer',
              onboardingCompleted: true
            }
          }
        };
      };

      try {
        const response = await loginRequest({
          email: 'explorer@example.com',
          password: 'SecretPassword123'
        });

        assert.equal(capturedRequests.length, 1);
        assert.equal(capturedRequests[0].url, '/api/auth/login');
        assert.equal(capturedRequests[0].payload.email, 'explorer@example.com');

        const user = extractUserData(response);
        assert.ok(user, 'User object should be extracted');
        assert.equal(user.id, 'user_abc123');
        assert.equal(user.displayName, 'Jane Explorer');
        assert.equal(user.email, 'explorer@example.com');
      } finally {
        apiClient.post = originalPost;
      }
    });

    it('propagates normalized validation or credential error on login rejection', async () => {
      const originalPost = apiClient.post;
      apiClient.post = async () => {
        const error = new Error('Request failed with status code 401');
        error.response = {
          status: 401,
          data: {
            success: false,
            error: {
              code: 'INVALID_CREDENTIALS',
              message: 'Invalid email or password.'
            }
          }
        };
        throw error;
      };

      try {
        let threw = false;
        try {
          await loginRequest({ email: 'wrong@example.com', password: 'bad' });
        } catch (err) {
          threw = true;
          const normalized = err.normalized || normalizeApiError(err);
          assert.equal(normalized.code, 'INVALID_CREDENTIALS');
          assert.equal(normalized.message, 'Invalid email or password.');
          assert.equal(normalized.isUnauthorized, true);
        }
        assert.ok(threw, 'loginRequest must throw when credentials fail');
      } finally {
        apiClient.post = originalPost;
      }
    });
  });

  describe('Session Restoration (GET /api/auth/me -> 200)', () => {
    it('restores authenticated user profile from active session cookie', async () => {
      const originalGet = apiClient.get;
      apiClient.get = async (url) => {
        capturedRequests.push({ method: 'GET', url });
        return {
          status: 200,
          data: {
            success: true,
            data: {
              id: 'user_active_session',
              email: 'active@example.com',
              displayName: 'Active Member',
              preferredArea: 'Central Park',
              searchRadiusKm: 5
            }
          }
        };
      };

      try {
        const response = await getCurrentUserRequest();
        assert.equal(capturedRequests[0].url, '/api/auth/me');

        const user = extractUserData(response);
        assert.equal(user.id, 'user_active_session');
        assert.equal(user.displayName, 'Active Member');
        assert.equal(user.preferredArea, 'Central Park');
      } finally {
        apiClient.get = originalGet;
      }
    });
  });

  describe('Logout & Session Invalidation (POST /api/auth/logout)', () => {
    it('dispatches logout request to POST /api/auth/logout', async () => {
      const originalPost = apiClient.post;
      apiClient.post = async (url) => {
        capturedRequests.push({ method: 'POST', url });
        return {
          status: 200,
          data: {
            success: true,
            data: { message: 'Logged out successfully' }
          }
        };
      };

      try {
        const res = await logoutRequest();
        assert.equal(capturedRequests[0].url, '/api/auth/logout');
        assert.equal(res.status, 200);
      } finally {
        apiClient.post = originalPost;
      }
    });
  });

  describe('extractUserData helper robustness', () => {
    it('extracts user from standard { success: true, data: { ... } } response', () => {
      const user = extractUserData({
        data: { success: true, data: { id: '1', displayName: 'Alex' } }
      });
      assert.deepEqual(user, { id: '1', displayName: 'Alex' });
    });

    it('extracts user from { user: { ... } } structure', () => {
      const user = extractUserData({
        data: { user: { id: '2', displayName: 'Sam' } }
      });
      assert.deepEqual(user, { id: '2', displayName: 'Sam' });
    });

    it('handles direct object fallback', () => {
      const user = extractUserData({ id: '3', displayName: 'Chris' });
      assert.deepEqual(user, { id: '3', displayName: 'Chris' });
    });

    it('returns null on null or undefined input', () => {
      assert.equal(extractUserData(null), null);
      assert.equal(extractUserData(undefined), null);
    });
  });

  describe('Registration & Email Verification API Client Flow', () => {
    it('dispatches registerRequest to POST /api/auth/register and parses user data', async () => {
      const originalPost = apiClient.post;
      apiClient.post = async (url, payload) => {
        capturedRequests.push({ method: 'POST', url, payload });
        return {
          status: 201,
          data: {
            success: true,
            data: {
              id: 'new_registered_user',
              displayName: payload.displayName,
              email: payload.email,
              isVerified: false
            },
            meta: {
              emailDelivered: false,
              devVerificationToken: 'dev_mock_token_12345'
            }
          }
        };
      };

      try {
        const res = await registerRequest({
          displayName: 'Test Runner',
          email: 'runner@example.com',
          password: 'Password123!'
        });

        assert.equal(capturedRequests[0].url, '/api/auth/register');
        assert.equal(capturedRequests[0].payload.displayName, 'Test Runner');
        assert.equal(res.status, 201);
        const user = extractUserData(res);
        assert.equal(user.id, 'new_registered_user');
        assert.equal(user.displayName, 'Test Runner');
        assert.equal(res.data.meta.devVerificationToken, 'dev_mock_token_12345');
      } finally {
        apiClient.post = originalPost;
      }
    });

    it('dispatches verifyEmailRequest to POST /api/auth/verify-email with token', async () => {
      const originalPost = apiClient.post;
      apiClient.post = async (url, payload) => {
        capturedRequests.push({ method: 'POST', url, payload });
        return {
          status: 200,
          data: {
            success: true,
            data: {
              message: 'Email successfully verified',
              isVerified: true,
              user: {
                id: 'verified_user',
                email: 'runner@example.com',
                displayName: 'Test Runner',
                isVerified: true
              }
            }
          }
        };
      };

      try {
        const res = await verifyEmailRequest({
          token: 'dev_mock_token_12345',
          email: 'runner@example.com'
        });

        assert.equal(capturedRequests[0].url, '/api/auth/verify-email');
        assert.equal(capturedRequests[0].payload.token, 'dev_mock_token_12345');
        assert.equal(res.status, 200);
        assert.equal(res.data.data.isVerified, true);
      } finally {
        apiClient.post = originalPost;
      }
    });
  });

  describe('Re-login Lifecycle (Login -> Logout -> Re-login)', () => {
    it('successfully logs in, clears on logout, and logs in again with original credentials', async () => {
      const originalPost = apiClient.post;
      let sessionActive = false;

      apiClient.post = async (url, payload) => {
        capturedRequests.push({ method: 'POST', url, payload });
        if (url === '/api/auth/login') {
          sessionActive = true;
          return {
            status: 200,
            data: {
              success: true,
              data: {
                id: 'persistent_user_id',
                email: payload.email,
                displayName: 'Persistent User'
              }
            }
          };
        }
        if (url === '/api/auth/logout') {
          sessionActive = false;
          return {
            status: 200,
            data: {
              success: true,
              data: { message: 'Logged out successfully' }
            }
          };
        }
        throw new Error(`Unexpected URL: ${url}`);
      };

      try {
        // Step 1: Initial Login
        const loginRes1 = await loginRequest({
          email: 'persistent@example.com',
          password: 'Password123!'
        });
        const user1 = extractUserData(loginRes1);
        assert.equal(user1.displayName, 'Persistent User');
        assert.equal(sessionActive, true);

        // Step 2: Logout
        const logoutRes = await logoutRequest();
        assert.equal(logoutRes.status, 200);
        assert.equal(sessionActive, false);

        // Step 3: Re-login with original credentials
        const loginRes2 = await loginRequest({
          email: 'persistent@example.com',
          password: 'Password123!'
        });
        const user2 = extractUserData(loginRes2);
        assert.equal(user2.displayName, 'Persistent User');
        assert.equal(sessionActive, true);
      } finally {
        apiClient.post = originalPost;
      }
    });
  });
});
