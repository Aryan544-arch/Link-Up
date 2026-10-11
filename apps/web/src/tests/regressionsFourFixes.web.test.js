import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { fetchActivities, requestToJoinActivity, fetchActivityRequests } from '../lib/activityApi.js';
import { planActivity } from '../lib/aiApi.js';
import apiClient from '../lib/api.js';

describe('MEETUP Pulse — Frontend Regressions Four Fixes Suite', () => {
  describe('Regression 4: Radius Query Formation & Coordinates Preservation', () => {
    it('sends lat, lng, and radiusKm together for various radii (1, 3, 5, 10, 25 km)', async () => {
      const originalGet = apiClient.get;
      const testedRadii = [1, 3, 5, 10, 25];

      for (const radius of testedRadii) {
        let capturedParams = null;
        apiClient.get = async (url, config) => {
          capturedParams = config.params;
          return {
            status: 200,
            data: {
              success: true,
              data: {
                activities: [],
                pagination: { page: 1, limit: 12, total: 0, totalPages: 1, hasNextPage: false }
              }
            }
          };
        };

        try {
          await fetchActivities({
            lat: 40.7681,
            lng: -73.9818,
            radiusKm: radius,
            category: 'fitness'
          });

          assert.ok(capturedParams, `Params must be captured for radius ${radius}`);
          assert.equal(capturedParams.lat, 40.7681, 'Latitude must be preserved');
          assert.equal(capturedParams.lng, -73.9818, 'Longitude must be preserved');
          assert.equal(capturedParams.radiusKm, radius, `radiusKm must match ${radius}`);
          assert.equal(capturedParams.category, 'fitness');
        } finally {
          apiClient.get = originalGet;
        }
      }
    });

    it('preserves coordinates when changing radius', async () => {
      const originalGet = apiClient.get;
      let calls = [];

      apiClient.get = async (url, config) => {
        calls.push(config.params);
        return {
          status: 200,
          data: {
            success: true,
            data: {
              activities: [],
              pagination: { page: 1, limit: 12, total: 0, totalPages: 1 }
            }
          }
        };
      };

      try {
        const coords = { lat: 40.7681, lng: -73.9818 };

        // Step 1: initial radius 3
        await fetchActivities({ ...coords, radiusKm: 3 });
        // Step 2: changed radius to 10
        await fetchActivities({ ...coords, radiusKm: 10 });

        assert.equal(calls.length, 2);
        assert.equal(calls[0].lat, 40.7681);
        assert.equal(calls[0].lng, -73.9818);
        assert.equal(calls[0].radiusKm, 3);

        assert.equal(calls[1].lat, 40.7681);
        assert.equal(calls[1].lng, -73.9818);
        assert.equal(calls[1].radiusKm, 10);
      } finally {
        apiClient.get = originalGet;
      }
    });
  });

  describe('Regression 2: AI Planning Client Pipeline & Provenance', () => {
    it('dispatches full context (prompt, budget, skillLevel, duration) to /api/ai/plan-activity', async () => {
      const originalPost = apiClient.post;
      let capturedPayload = null;

      apiClient.post = async (url, payload) => {
        capturedPayload = payload;
        return {
          status: 200,
          data: {
            success: true,
            data: {
              suggestion: {
                title: 'Tailored 5K Track Sprint',
                description: 'An intensive track sprint session in Downtown Campus Quad. Aimed at advanced runners.',
                category: 'fitness',
                skillLevel: 'advanced',
                capacity: 8,
                budget: 15,
                suggestedDurationMinutes: 60,
                displayArea: 'Downtown Campus Quad'
              },
              source: 'fallback',
              provider: 'deterministic-fallback',
              disclaimer: 'Deterministic fallback template.'
            }
          }
        };
      };

      try {
        const result = await planActivity({
          prompt: 'Track sprint training',
          category: 'fitness',
          locationHint: 'Downtown Campus Quad',
          targetGroupSize: 8,
          budget: 15,
          skillLevel: 'advanced',
          durationMinutes: 60
        });

        assert.ok(capturedPayload);
        assert.equal(capturedPayload.prompt, 'Track sprint training');
        assert.equal(capturedPayload.category, 'fitness');
        assert.equal(capturedPayload.locationHint, 'Downtown Campus Quad');
        assert.equal(capturedPayload.budget, 15);
        assert.equal(capturedPayload.skillLevel, 'advanced');
        assert.equal(capturedPayload.durationMinutes, 60);

        assert.equal(result.title, 'Tailored 5K Track Sprint');
        assert.equal(result.source, 'fallback');
        assert.equal(result.provider, 'deterministic-fallback');
        assert.ok(result.disclaimer);
      } finally {
        apiClient.post = originalPost;
      }
    });
  });

  describe('Regression 1: Participation Requests & Organizer Resolution', () => {
    it('dispatches join request note and parses pending status correctly', async () => {
      const originalPost = apiClient.post;
      let capturedPayload = null;

      apiClient.post = async (url, payload) => {
        capturedPayload = payload;
        return {
          status: 201,
          data: {
            success: true,
            data: {
              id: 'req_123',
              activityId: 'act_456',
              userId: 'user_789',
              status: 'pending',
              note: 'Excited to join the meetup!'
            }
          }
        };
      };

      try {
        const response = await requestToJoinActivity('act_456', {
          note: 'Excited to join the meetup!'
        });

        assert.equal(capturedPayload.note, 'Excited to join the meetup!');
        assert.equal(response.status, 'pending');
        assert.equal(response.id, 'req_123');
      } finally {
        apiClient.post = originalPost;
      }
    });

    it('organizer requests listing preserves populated participant display names', async () => {
      const originalGet = apiClient.get;

      apiClient.get = async (url) => {
        return {
          status: 200,
          data: {
            success: true,
            data: {
              requests: [
                {
                  id: 'req_1',
                  activityId: 'act_100',
                  userId: {
                    _id: 'user_001',
                    displayName: 'Alice Walker'
                  },
                  status: 'pending',
                  note: 'Love photography!',
                  createdAt: '2026-10-12T00:00:00.000Z'
                },
                {
                  id: 'req_2',
                  activityId: 'act_100',
                  userId: {
                    _id: 'user_002',
                    displayName: 'Bob Smith'
                  },
                  status: 'pending',
                  note: 'Bringing extra lenses',
                  createdAt: '2026-10-12T01:00:00.000Z'
                }
              ]
            }
          }
        };
      };

      try {
        const list = await fetchActivityRequests('act_100');

        assert.equal(list.length, 2);
        assert.equal(list[0].userId.displayName, 'Alice Walker');
        assert.equal(list[1].userId.displayName, 'Bob Smith');
        assert.notEqual(list[0].userId.displayName, 'Participant');
        assert.notEqual(list[1].userId.displayName, 'Participant');
      } finally {
        apiClient.get = originalGet;
      }
    });
  });
});
