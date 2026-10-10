import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import apiClient, { normalizeApiError } from '../lib/api';
import { loginRequest, logoutRequest } from '../lib/authApi';

/**
 * Authentication Context for LinkUp
 * 
 * Strict session-based authentication conforming to MEETUP_Pulse_PRD.md:
 * - Backed by server session cookie (GET /api/auth/me).
 * - No JWTs, localStorage, or sessionStorage secrets.
 * - Handles distinct states:
 *   1. 'CHECKING': Session check in progress.
 *   2. 'AUTHENTICATED': Valid session verified by server.
 *   3. 'UNAUTHENTICATED': Explicit 401 response from server; no active session.
 *   4. 'UNAVAILABLE': Server unreachable or network error. (Never assumed logged out).
 */

const AuthContext = createContext(null);

export const AuthStatus = {
  CHECKING: 'CHECKING',
  AUTHENTICATED: 'AUTHENTICATED',
  UNAUTHENTICATED: 'UNAUTHENTICATED',
  UNAVAILABLE: 'UNAVAILABLE',
};

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [status, setStatus] = useState(AuthStatus.CHECKING);
  const [error, setError] = useState(null);

  /**
   * Fetches current user session from GET /api/auth/me
   */
  const refreshUser = useCallback(async () => {
    setStatus(AuthStatus.CHECKING);
    setError(null);

    try {
      const response = await apiClient.get('/api/auth/me');
      // Server returns user data on HTTP 200
      const userData = response.data?.user || response.data;
      setUser(userData);
      setStatus(AuthStatus.AUTHENTICATED);
      return { success: true, user: userData };
    } catch (err) {
      const normalized = err.normalized || normalizeApiError(err);

      if (normalized.isUnauthorized) {
        // Explicit 401 from backend: Session does not exist or has expired
        setUser(null);
        setStatus(AuthStatus.UNAUTHENTICATED);
        setError(null);
        return { success: false, unauthenticated: true };
      }

      if (normalized.isNetworkError || normalized.status >= 500) {
        // Server unreachable or connection error:
        // DO NOT treat network failure as proof that user is logged out.
        setStatus(AuthStatus.UNAVAILABLE);
        setError(normalized);
        return { success: false, unavailable: true, error: normalized };
      }

      // Any other unexpected response
      setStatus(AuthStatus.UNAVAILABLE);
      setError(normalized);
      return { success: false, error: normalized };
    }
  }, []);

  /**
   * Attempts login via POST /api/auth/login
   */
  const login = useCallback(async (credentials) => {
    try {
      const response = await loginRequest(credentials);
      const userData = response.data?.user || response.data;
      setUser(userData);
      setStatus(AuthStatus.AUTHENTICATED);
      setError(null);
      return { success: true, user: userData };
    } catch (err) {
      const normalized = err.normalized || normalizeApiError(err);
      // Record error for form feedback, but do NOT erase an existing valid session without server invalidation
      setError(normalized);
      throw normalized;
    }
  }, []);

  /**
   * Terminates session via POST /api/auth/logout
   */
  const logout = useCallback(async () => {
    try {
      await logoutRequest();
    } catch (err) {
      // Even if network drops during logout, clear local client state
      console.warn('Logout request encountered error:', err.message);
    } finally {
      setUser(null);
      setStatus(AuthStatus.UNAUTHENTICATED);
      setError(null);
    }
  }, []);

  // Initialize session verification on mount
  useEffect(() => {
    refreshUser();
  }, [refreshUser]);

  const value = {
    user,
    status,
    isAuthenticated: status === AuthStatus.AUTHENTICATED,
    isLoading: status === AuthStatus.CHECKING,
    isUnavailable: status === AuthStatus.UNAVAILABLE,
    error,
    refreshUser,
    login,
    logout,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

/**
 * Hook to consume AuthContext safely
 */
export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

export default AuthContext;
