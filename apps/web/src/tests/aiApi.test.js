import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { apiClient } from '../lib/api.js';
import { getAiStatus, planActivity } from '../lib/aiApi.js';

describe('AI Planning Client Suite (Section 9 AI Foundation)', () => {
  it('fetches AI status via GET /api/ai/status', async () => {
    const originalGet = apiClient.get;
    apiClient.get = async (url) => {
      assert.equal(url, '/api/ai/status');
      return {
        data: {
          status: 'success',
          data: {
            enabled: true,
            provider: 'mock-gemini',
            model: 'gemini-1.5-flash'
          }
        }
      };
    };

    try {
      const status = await getAiStatus();
      assert.equal(status.enabled, true);
      assert.equal(status.provider, 'mock-gemini');
      assert.equal(status.model, 'gemini-1.5-flash');
    } finally {
      apiClient.get = originalGet;
    }
  });

  it('generates activity draft via POST /api/ai/plan-activity without auto-publishing', async () => {
    const originalPost = apiClient.post;
    let capturedPayload = null;

    apiClient.post = async (url, payload) => {
      assert.equal(url, '/api/ai/plan-activity');
      capturedPayload = payload;
      return {
        data: {
          status: 'success',
          data: {
            plan: {
              title: 'Casual Frisbee Match',
              description: 'Fun outdoor ultimate frisbee in the park.',
              category: 'outdoor',
              suggestedCapacity: 10,
              skillLevel: 'all-levels',
              suggestedDurationMinutes: 90,
              suggestedRules: ['Bring sneakers'],
              suggestedDisplayArea: 'Central Park Meadow',
              budgetEstimate: 0,
              source: 'fallback'
            }
          }
        }
      };
    };

    try {
      const plan = await planActivity({
        prompt: 'Casual ultimate frisbee',
        category: 'outdoor',
        locationHint: 'Central Park'
      });

      assert.deepEqual(capturedPayload, {
        prompt: 'Casual ultimate frisbee',
        category: 'outdoor',
        locationHint: 'Central Park'
      });
      assert.equal(plan.title, 'Casual Frisbee Match');
      assert.equal(plan.suggestedCapacity, 10);
      assert.equal(plan.source, 'fallback');
    } finally {
      apiClient.post = originalPost;
    }
  });
});
