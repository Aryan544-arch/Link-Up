import axios from 'axios';

/**
 * LinkUp Centralized API Client
 * 
 * Configured according to MEETUP_Pulse_PRD.md:
 * - Session-based authentication via HTTP-only cookies (withCredentials: true).
 * - No JWTs, localStorage, or sessionStorage tokens.
 * - Base URL dynamically configured via VITE_API_BASE_URL (defaults to http://localhost:3000).
 * - Centralized response-error normalization without disruptive forced redirects on 401.
 */

/**
 * Resolves the backend API base URL dynamically.
 * Prioritizes VITE_API_BASE_URL if configured.
 * In browser runtime, derives the host from window.location.hostname so that
 * requests from both localhost (http://localhost:5173) and LAN IPs (e.g. http://10.162.61.69:5173)
 * target the backend at the same host (:3000). This ensures session cookies (connect.sid)
 * are treated as same-site and delivered reliably with withCredentials: true.
 */
export function resolveApiBaseUrl() {
  if (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_BASE_URL) {
    return import.meta.env.VITE_API_BASE_URL;
  }
  if (typeof window !== 'undefined' && window.location?.hostname) {
    const protocol = window.location.protocol || 'http:';
    const hostname = window.location.hostname;
    return `${protocol}//${hostname}:3000`;
  }
  return 'http://localhost:3000';
}

export const API_BASE_URL = resolveApiBaseUrl();

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  },
  timeout: 10000,
});

/**
 * Utility to normalize API errors into an intelligible structure.
 * Never exposes raw secrets, sensitive tokens, or internal stack traces.
 */
export function normalizeApiError(error) {
  if (!error.response) {
    // Network error or backend offline
    return {
      status: 0,
      code: 'NETWORK_ERROR',
      message: 'Unable to connect to the LinkUp server. Please check your network connection.',
      isNetworkError: true,
      originalError: error,
    };
  }

  const { status, data } = error.response;

  // Extract friendly error message, code, and details from backend response envelope:
  // Standard format per API contract: { success: false, error: { code, message, details? } }
  let message = 'An unexpected error occurred. Please try again.';
  let code = `HTTP_${status}`;
  let details = null;

  if (data && typeof data === 'object') {
    if (data.error && typeof data.error === 'object') {
      message = data.error.message || message;
      code = data.error.code || code;
      details = data.error.details || null;
    } else if (typeof data.error === 'string') {
      message = data.error;
    } else if (typeof data.message === 'string') {
      message = data.message;
    }

    if (data.code && typeof data.code === 'string') {
      code = data.code;
    }

    if (Array.isArray(data.errors) && data.errors.length > 0) {
      // Common Zod validation error array fallback
      message = data.errors.map(err => err.message || err).join(', ');
      details = details || data.errors;
    }
  }

  return {
    status,
    code,
    message,
    details,
    errors: details || data?.errors || null,
    isUnauthorized: status === 401,
    isForbidden: status === 403,
    isNotFound: status === 404,
    isValidationError: status === 400 || status === 422,
    isServerError: status >= 500,
  };
}

// Response interceptor for consistent error normalization
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    const normalized = normalizeApiError(error);
    // Attach normalized metadata onto the error object before rejecting
    error.normalized = normalized;
    return Promise.reject(error);
  }
);

export default apiClient;
