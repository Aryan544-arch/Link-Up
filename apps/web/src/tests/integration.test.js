import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { apiClient, normalizeApiError } from '../lib/api.js';
import {
  fetchActivities,
  fetchActivityById,
  createActivity,
  publishActivity,
  requestToJoinActivity,
  cancelJoinRequest,
  fetchActivityRequests,
  decideJoinRequest,
  fetchMyPlans,
  reportActivity,
  decideProposal,
  cancelProposal,
  cancelActivity
} from '../lib/activityApi.js';


describe('Person 1: Frontend Client & Contract Suite (Mock-Isolated)', () => {
  let capturedRequests = [];

  beforeEach(() => {
    capturedRequests = [];
  });

  describe('Step 3: Error Envelope Normalization', () => {
    it('normalizes standard backend error envelope { success: false, error: { code, message, details } }', () => {
      const mockError = {
        response: {
          status: 400,
          data: {
            success: false,
            error: {
              code: 'INVALID_CAPACITY',
              message: 'Capacity must be at least 2 participants.',
              details: [{ field: 'capacity', message: 'Minimum 2' }]
            }
          }
        }
      };

      const normalized = normalizeApiError(mockError);
      assert.equal(normalized.status, 400);
      assert.equal(normalized.code, 'INVALID_CAPACITY');
      assert.equal(normalized.message, 'Capacity must be at least 2 participants.');
      assert.deepEqual(normalized.details, [{ field: 'capacity', message: 'Minimum 2' }]);
      assert.equal(normalized.isValidationError, true);
    });

    it('handles network disconnection gracefully without exposing raw tokens', () => {
      const netError = new Error('Network timeout');
      const normalized = normalizeApiError(netError);

      assert.equal(normalized.status, 0);
      assert.equal(normalized.code, 'NETWORK_ERROR');
      assert.equal(normalized.isNetworkError, true);
      assert.match(normalized.message, /Unable to connect/);
    });

    it('identifies 401 unauthorized without redirecting or throwing unhandled errors', () => {
      const authError = {
        response: {
          status: 401,
          data: {
            success: false,
            error: {
              code: 'UNAUTHORIZED',
              message: 'Session expired or invalid.'
            }
          }
        }
      };

      const normalized = normalizeApiError(authError);
      assert.equal(normalized.status, 401);
      assert.equal(normalized.isUnauthorized, true);
      assert.equal(normalized.message, 'Session expired or invalid.');
    });
  });

  describe('Step 4: Discovery Query Parameters & Pagination', () => {
    it('sends lat and lng together and uses radiusKm (not radius)', async () => {
      // Mock apiClient.get
      const originalGet = apiClient.get;
      apiClient.get = async (url, config) => {
        capturedRequests.push({ url, config });
        return {
          status: 200,
          data: {
            success: true,
            data: {
              activities: [
                { id: 'act-1', title: 'Running Meetup', displayArea: 'Park', capacity: 10 }
              ],
              pagination: { page: 1, limit: 12, total: 1, hasMore: false }
            }
          }
        };
      };

      try {
        const result = await fetchActivities({
          lat: 37.7749,
          lng: -122.4194,
          radiusKm: 5,
          category: 'Fitness',
          skillLevel: 'Intermediate',
          maxBudget: 20,
          page: 1,
          limit: 12,
        });

        assert.equal(capturedRequests.length, 1);
        const { params } = capturedRequests[0].config;
        assert.equal(params.lat, 37.7749);
        assert.equal(params.lng, -122.4194);
        assert.equal(params.radiusKm, 5);
        assert.equal(params.radius, undefined, 'Must not send "radius"');
        assert.equal(params.category, 'Fitness');
        assert.equal(params.skillLevel, 'Intermediate');
        assert.equal(params.maxBudget, 20);
        assert.equal(params.search, undefined, 'Must not send search keyword');

        assert.equal(result.activities.length, 1);
        assert.equal(result.activities[0].title, 'Running Meetup');
        assert.equal(result.pagination.hasMore, false);
      } finally {
        apiClient.get = originalGet;
      }
    });

    it('omits coordinates if one or both coordinates are missing', async () => {
      const originalGet = apiClient.get;
      apiClient.get = async (url, config) => {
        capturedRequests.push({ url, config });
        return {
          status: 200,
          data: {
            data: {
              activities: [],
              pagination: { page: 1, limit: 12, total: 0, hasMore: false }
            }
          }
        };
      };

      try {
        await fetchActivities({
          lat: 37.7749,
          lng: undefined, // Missing longitude
          category: 'Outdoor & Sports'
        });

        const { params } = capturedRequests[0].config;
        assert.equal(params.lat, undefined, 'lat must be omitted when lng is missing');
        assert.equal(params.lng, undefined, 'lng must be omitted when missing');
        assert.equal(params.category, 'Outdoor & Sports');
      } finally {
        apiClient.get = originalGet;
      }
    });

    it('correctly calculates hasMore continuation for pagination', async () => {
      const originalGet = apiClient.get;
      apiClient.get = async (url, config) => {
        return {
          status: 200,
          data: {
            data: {
              activities: [{ id: '1' }, { id: '2' }],
              pagination: { page: 1, limit: 2, total: 10 }
            }
          }
        };
      };

      try {
        const result = await fetchActivities({ page: 1, limit: 2 });
        assert.equal(result.pagination.hasMore, true, 'page 1 with limit 2 of total 10 must have more');
      } finally {
        apiClient.get = originalGet;
      }
    });
  });

  describe('Step 5: Activity Details & Reporting Safety', () => {
    it('fetches activity details preserving displayArea and location privacy', async () => {
      const originalGet = apiClient.get;
      apiClient.get = async (url) => {
        return {
          status: 200,
          data: {
            data: {
              activity: {
                id: 'act-123',
                title: 'Sunset Board Games',
                displayArea: 'Student Center Lawn',
                coordinates: null,
                isPrecise: false,
                capacity: 8,
                placesFilled: 3
              }
            }
          }
        };
      };

      try {
        const activity = await fetchActivityById('act-123');
        assert.equal(activity.id, 'act-123');
        assert.equal(activity.displayArea, 'Student Center Lawn');
        assert.equal(activity.coordinates, null);
        assert.equal(activity.isPrecise, false);
      } finally {
        apiClient.get = originalGet;
      }
    });

    it('rejects reportActivity and never calls POST /api/reports', async () => {
      const originalPost = apiClient.post;
      apiClient.post = async () => {
        assert.fail('apiClient.post must NEVER be called by reportActivity in demo');
      };

      try {
        await assert.rejects(
          async () => {
            await reportActivity('act-123');
          },
          {
            message: 'Reporting is unavailable in this demo'
          }
        );
      } finally {
        apiClient.post = originalPost;
      }
    });
  });

  describe('Step 6: Create Draft and Explicit Publishing', () => {
    it('creates draft activity with GeoJSON [longitude, latitude] coordinates and required fields', async () => {
      const originalPost = apiClient.post;
      apiClient.post = async (url, body) => {
        capturedRequests.push({ url, body });
        return {
          status: 201,
          data: {
            data: {
              activity: {
                id: 'draft-999',
                status: 'draft',
                ...body
              }
            }
          }
        };
      };

      try {
        const payload = {
          title: 'Sunset Spikeball',
          category: 'Outdoor & Sports',
          description: 'Casual spikeball games at the park for all levels.',
          displayArea: 'Mission Dolores Lawn',
          startsAt: '2026-10-15T18:00:00.000Z',
          endsAt: '2026-10-15T19:30:00.000Z',
          capacity: 8,
          location: {
            type: 'Point',
            coordinates: [-122.4269, 37.7596], // [longitude, latitude]
          },
        };

        const result = await createActivity(payload);
        assert.equal(capturedRequests[0].url, '/api/activities');
        assert.equal(result.id, 'draft-999');
        assert.equal(result.status, 'draft');
        assert.deepEqual(capturedRequests[0].body.location.coordinates, [-122.4269, 37.7596]);
        assert.equal(capturedRequests[0].body.organizerId, undefined, 'Server-managed organizerId must be omitted');
      } finally {
        apiClient.post = originalPost;
      }
    });

    it('publishes activity draft as a separate explicit operation', async () => {
      const originalPost = apiClient.post;
      apiClient.post = async (url, body) => {
        capturedRequests.push({ url, body });
        return {
          status: 200,
          data: {
            data: {
              activity: {
                id: 'draft-999',
                status: 'published'
              }
            }
          }
        };
      };

      try {
        const result = await publishActivity('draft-999');
        assert.equal(capturedRequests[0].url, '/api/activities/draft-999/publish');
        assert.equal(result.status, 'published');
      } finally {
        apiClient.post = originalPost;
      }
    });

    it('surfaces normalized error on publish failure to preserve draft without creating duplicate', async () => {
      const originalPost = apiClient.post;
      apiClient.post = async () => {
        const error = new Error('Publishing failed');
        error.response = {
          status: 500,
          data: {
            success: false,
            error: {
              code: 'PUBLISH_FAILED',
              message: 'Server failed to publish draft'
            }
          }
        };
        throw error;
      };

      try {
        await assert.rejects(
          async () => {
            await publishActivity('draft-999');
          },
          (err) => {
            const normalized = normalizeApiError(err);
            assert.equal(normalized.status, 500);
            assert.equal(normalized.code, 'PUBLISH_FAILED');
            return true;
          }
        );
      } finally {
        apiClient.post = originalPost;
      }
    });
  });

  describe('Step 7: Join Requests and Organizer Management', () => {
    it('submits join request to POST /api/activities/:id/join', async () => {
      const originalPost = apiClient.post;
      apiClient.post = async (url, body) => {
        capturedRequests.push({ url, body });
        return {
          status: 201,
          data: {
            data: {
              id: 'req-001',
              status: 'pending'
            }
          }
        };
      };

      try {
        const result = await requestToJoinActivity('act-555', { note: 'Excited to join!' });
        assert.equal(capturedRequests[0].url, '/api/activities/act-555/join');
        assert.equal(capturedRequests[0].body.note, 'Excited to join!');
        assert.equal(result.status, 'pending');
      } finally {
        apiClient.post = originalPost;
      }
    });

    it('cancels join request via POST /api/join-requests/:id/cancel (never DELETE)', async () => {
      const originalPost = apiClient.post;
      apiClient.post = async (url, body) => {
        capturedRequests.push({ url, body });
        return {
          status: 200,
          data: {
            data: {
              id: 'req-001',
              status: 'cancelled'
            }
          }
        };
      };

      try {
        const result = await cancelJoinRequest('req-001');
        assert.equal(capturedRequests[0].url, '/api/join-requests/req-001/cancel');
        assert.equal(result.status, 'cancelled');
      } finally {
        apiClient.post = originalPost;
      }
    });

    it('fetches organizer requests and approves or rejects via PATCH /api/join-requests/:id', async () => {
      const originalGet = apiClient.get;
      const originalPatch = apiClient.patch;

      apiClient.get = async (url) => {
        capturedRequests.push({ method: 'GET', url });
        return {
          status: 200,
          data: {
            data: {
              requests: [
                { id: 'req-1', displayName: 'Alice', status: 'pending' },
                { id: 'req-2', displayName: 'Bob', status: 'pending' },
              ]
            }
          }
        };
      };

      apiClient.patch = async (url, body) => {
        capturedRequests.push({ method: 'PATCH', url, body });
        return {
          status: 200,
          data: {
            data: {
              id: url.split('/').pop(),
              status: body.status
            }
          }
        };
      };

      try {
        const requests = await fetchActivityRequests('act-555');
        assert.equal(requests.length, 2);
        assert.equal(capturedRequests[0].url, '/api/activities/act-555/requests');

        const approveResult = await decideJoinRequest('req-1', 'approved');
        assert.equal(approveResult.status, 'approved');
        assert.deepEqual(capturedRequests[1].body, { status: 'approved' });

        const rejectResult = await decideJoinRequest('req-2', 'rejected');
        assert.equal(rejectResult.status, 'rejected');
        assert.deepEqual(capturedRequests[2].body, { status: 'rejected' });
      } finally {
        apiClient.get = originalGet;
        apiClient.patch = originalPatch;
      }
    });
  });

  describe('Step 8: My Plans Contract Alignment (Confirmed Contract)', () => {
    it('dispatches GET /api/me/plans and handles confirmed 6-field envelope with wrapped items and summary', async () => {
      const originalGet = apiClient.get;
      apiClient.get = async (url) => {
        capturedRequests.push({ url });
        return {
          status: 200,
          data: {
            success: true,
            data: {
              organized: [
                { id: 'act-org-1', title: 'Sunset Hike', organizerId: 'user-123', displayArea: 'Twin Peaks' }
              ],
              joined: [
                {
                  requestId: 'req-join-10',
                  status: 'approved',
                  joinedAt: '2026-10-12T10:00:00.000Z',
                  activity: {
                    id: 'act-j-1',
                    title: 'Morning Yoga',
                    organizerId: 'org-456',
                    displayArea: 'Presidio Lawn'
                  }
                }
              ],
              pendingRequests: [
                {
                  requestId: 'req-pend-20',
                  status: 'pending',
                  note: 'Looking forward to this!',
                  createdAt: '2026-10-11T09:00:00.000Z',
                  activity: {
                    id: 'act-p-1',
                    title: 'Board Game Cafe',
                    organizerId: 'org-789',
                    displayArea: 'Mission District'
                  }
                }
              ],
              interestRequests: [
                { id: 'ir-1', topic: 'Climbing', displayArea: 'Mission', status: 'active' }
              ],
              proposals: [
                { id: 'prop-1', title: 'Coffee Chat', userRole: 'recipient', status: 'pending', displayArea: 'Castro' }
              ],
              summary: {
                organized: 1,
                joined: 1,
                pendingRequests: 1,
                interestRequests: 1,
                proposals: 1,
                totalPlansCount: 5
              }
            }
          }
        };
      };

      try {
        const plans = await fetchMyPlans();
        assert.equal(capturedRequests[0].url, '/api/me/plans');
        assert.equal(plans.organized.length, 1);
        assert.equal(plans.organized[0].organizerId, 'user-123');
        assert.equal(plans.joined.length, 1);
        assert.equal(plans.joined[0].requestId, 'req-join-10');
        assert.equal(plans.joined[0].activity.title, 'Morning Yoga');
        assert.equal(plans.pendingRequests.length, 1);
        assert.equal(plans.pendingRequests[0].requestId, 'req-pend-20');
        assert.equal(plans.pendingRequests[0].note, 'Looking forward to this!');
        assert.equal(plans.interestRequests.length, 1);
        assert.equal(plans.proposals.length, 1);
        assert.equal(plans.proposals[0].userRole, 'recipient');
        assert.equal(plans.summary.totalPlansCount, 5);
      } finally {
        apiClient.get = originalGet;
      }
    });

    it('cancels joined and pending requests strictly using item.requestId (never item._id or joinRequestId)', async () => {
      const originalPost = apiClient.post;
      apiClient.post = async (url) => {
        capturedRequests.push({ url });
        return {
          status: 200,
          data: { success: true, data: { status: 'cancelled' } }
        };
      };

      try {
        // Cancel joined request using item.requestId
        await cancelJoinRequest('req-join-10');
        assert.equal(capturedRequests[0].url, '/api/join-requests/req-join-10/cancel');

        // Cancel pending request using item.requestId
        await cancelJoinRequest('req-pend-20');
        assert.equal(capturedRequests[1].url, '/api/join-requests/req-pend-20/cancel');

        // Rejects if requestId is missing
        await assert.rejects(
          async () => {
            await cancelJoinRequest('');
          },
          { message: 'Join request ID is required to cancel.' }
        );
      } finally {
        apiClient.post = originalPost;
      }
    });

    it('surfaces 404 error cleanly when backend endpoint is unimplemented without falling back to fake plans', async () => {
      const originalGet = apiClient.get;
      apiClient.get = async () => {
        const error = new Error('Request failed with status code 404');
        error.response = {
          status: 404,
          data: {
            success: false,
            error: {
              code: 'NOT_FOUND',
              message: 'Route GET /api/me/plans not found'
            }
          }
        };
        throw error;
      };

      try {
        await assert.rejects(
          async () => {
            await fetchMyPlans();
          },
          (err) => {
            const normalized = normalizeApiError(err);
            assert.equal(normalized.status, 404);
            assert.equal(normalized.isNotFound, true);
            assert.equal(normalized.code, 'NOT_FOUND');
            return true;
          }
        );
      } finally {
        apiClient.get = originalGet;
      }
    });
  });

  describe('Step 9: Phase 7 Proposal Actions & Activity Cancellation', () => {
    it('accepts proposal via PATCH /api/proposals/:id with { decision: "accepted" }', async () => {
      const originalPatch = apiClient.patch;
      apiClient.patch = async (url, body) => {
        capturedRequests.push({ method: 'PATCH', url, body });
        return {
          status: 200,
          data: {
            success: true,
            data: {
              proposal: { id: 'prop-123', status: 'accepted' },
              activity: { id: 'act-new-1', title: 'Joint Hike' }
            }
          }
        };
      };

      try {
        const result = await decideProposal('prop-123', 'accepted');
        assert.equal(capturedRequests[0].url, '/api/proposals/prop-123');
        assert.deepEqual(capturedRequests[0].body, { decision: 'accepted' });
        assert.equal(result.proposal.status, 'accepted');
        assert.equal(result.activity.title, 'Joint Hike');
      } finally {
        apiClient.patch = originalPatch;
      }
    });

    it('rejects proposal via PATCH /api/proposals/:id with { decision: "rejected" }', async () => {
      const originalPatch = apiClient.patch;
      apiClient.patch = async (url, body) => {
        capturedRequests.push({ method: 'PATCH', url, body });
        return {
          status: 200,
          data: {
            success: true,
            data: { id: 'prop-123', status: 'rejected' }
          }
        };
      };

      try {
        const result = await decideProposal('prop-123', 'rejected');
        assert.equal(capturedRequests[0].url, '/api/proposals/prop-123');
        assert.deepEqual(capturedRequests[0].body, { decision: 'rejected' });
        assert.equal(result.status, 'rejected');
      } finally {
        apiClient.patch = originalPatch;
      }
    });

    it('validates decision parameter must be accepted or rejected', async () => {
      await assert.rejects(
        async () => {
          await decideProposal('prop-123', 'maybe');
        },
        { message: "Decision must be either 'accepted' or 'rejected'." }
      );

      await assert.rejects(
        async () => {
          await decideProposal('', 'accepted');
        },
        { message: 'Proposal ID is required to make a decision.' }
      );
    });

    it('cancels pending proposal via POST /api/proposals/:id/cancel', async () => {
      const originalPost = apiClient.post;
      apiClient.post = async (url, body) => {
        capturedRequests.push({ method: 'POST', url, body });
        return {
          status: 200,
          data: {
            success: true,
            data: { id: 'prop-123', status: 'cancelled' }
          }
        };
      };

      try {
        const result = await cancelProposal('prop-123');
        assert.equal(capturedRequests[0].url, '/api/proposals/prop-123/cancel');
        assert.equal(result.status, 'cancelled');
      } finally {
        apiClient.post = originalPost;
      }
    });

    it('cancels organized activity via POST /api/activities/:id/cancel', async () => {
      const originalPost = apiClient.post;
      apiClient.post = async (url, body) => {
        capturedRequests.push({ method: 'POST', url, body });
        return {
          status: 200,
          data: {
            success: true,
            data: { id: 'act-999', status: 'cancelled' }
          }
        };
      };

      try {
        const result = await cancelActivity('act-999');
        assert.equal(capturedRequests[0].url, '/api/activities/act-999/cancel');
        assert.equal(result.status, 'cancelled');
      } finally {
        apiClient.post = originalPost;
      }
    });
  });
});

