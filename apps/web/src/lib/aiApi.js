import apiClient from './api.js';

/**
 * LinkUp AI Planning API Service
 *
 * Implements client bindings for Section 9 AI Foundation:
 * - GET /api/ai/status: checks whether AI planning is configured and active
 * - POST /api/ai/plan-activity: generates structured activity draft suggestions (with deterministic fallback)
 *
 * NOTE: AI suggestions are strictly editable drafts. They are never automatically published
 * or confirmed per PRD Section 7 and 9.
 */

/**
 * Checks AI service status and configured provider.
 *
 * @returns {Promise<{ enabled: boolean, provider: string, model: string }>}
 */
export async function getAiStatus() {
  const response = await apiClient.get('/api/ai/status');
  return response.data?.data || { enabled: false, provider: 'none', model: 'none' };
}

/**
 * Requests an AI activity plan draft.
 *
 * @param {object} payload
 * @param {string} payload.prompt - User's brief activity idea (3-500 chars)
 * @param {string} [payload.category] - Optional category hint
 * @param {string} [payload.locationHint] - Optional neighborhood/campus hint
 * @param {number} [payload.targetGroupSize] - Optional desired headcount (2-100)
 * @returns {Promise<object>} The suggested plan object
 */
export async function planActivity(payload) {
  const response = await apiClient.post('/api/ai/plan-activity', payload);
  const data = response.data?.data;
  const plan = data?.suggestion || data?.plan || data;
  if (plan && data?.source && !plan.source) {
    plan.source = data.source;
  }
  return plan;
}
