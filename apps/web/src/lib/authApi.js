import apiClient from './api.js';

/**
 * LinkUp Authentication API Service
 * 
 * Centralizes auth and profile HTTP requests per MEETUP_Pulse_PRD.md (§11).
 * Isolates endpoint contracts and documents unresolved decisions.
 */

/**
 * Register a new user
 * PRD Contract: POST /api/auth/register
 * Status: Baseline defined in PRD §4 Journey A & §11
 */
export async function registerRequest({ displayName, email, password }) {
  return apiClient.post('/api/auth/register', {
    displayName,
    email,
    password
  });
}

/**
 * Verify user email
 * PRD Contract: POST /api/auth/verify-email
 * Status: UNRESOLVED (PRD §16, Open Decision 4: Link token vs OTP code)
 * 
 * Pending backend team decision (Person 3):
 * - If link-token: backend expects { token: string } or GET with ?token=
 * - If OTP: backend expects { code: string, email: string }
 * 
 * This baseline integration function passes { token, email }.
 * It does NOT invent a fake success response.
 */
export async function verifyEmailRequest({ token, email }) {
  return apiClient.post('/api/auth/verify-email', {
    token,
    ...(email ? { email } : {}),
  });
}

/**
 * Login user
 * PRD Contract: POST /api/auth/login
 * Status: Defined in PRD §4 Journey B & §11
 */
export async function loginRequest(credentials) {
  return apiClient.post('/api/auth/login', credentials);
}

/**
 * Logout user session
 * PRD Contract: POST /api/auth/logout
 * Status: Defined in PRD §4 & §11
 */
export async function logoutRequest() {
  return apiClient.post('/api/auth/logout');
}

/**
 * Save user onboarding preferences
 * PRD Contract: PATCH /api/me/preferences
 * Status: Defined in PRD §10 & §11
 * 
 * Privacy Rule: Exact coordinates are NOT persisted to the general profile/preferences.
 * Only the preferred area name, location mode, and default search radius (3 km) are sent.
 */
export async function updatePreferencesRequest(preferences) {
  return apiClient.patch('/api/me/preferences', preferences);
}

/**
 * Fetch current authenticated user session
 * PRD Contract: GET /api/auth/me
 * Status: Defined in PRD §4 Journey B & §11
 */
export async function getCurrentUserRequest() {
  return apiClient.get('/api/auth/me');
}

/**
 * Safely extracts user profile data from backend response envelope.
 * Supports standard API envelope { success: true, data: user }, legacy { user }, or direct object.
 */
export function extractUserData(response) {
  if (!response || typeof response !== 'object') return null;
  const body = response.data || response;
  if (!body || typeof body !== 'object') return null;
  return body.data || body.user || body;
}
