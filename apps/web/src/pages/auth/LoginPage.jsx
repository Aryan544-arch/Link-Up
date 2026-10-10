import React, { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import FormInput from '../../components/common/FormInput';
import AlertBanner from '../../components/common/AlertBanner';
import { useAuth } from '../../context/AuthContext';
import { LogIn, ArrowRight } from 'lucide-react';

// Utility to safely extract and validate relative redirect destinations
function getSafeRedirectUrl(search) {
  try {
    const params = new URLSearchParams(search);
    const redirect = params.get('redirect');
    // Ensure redirect is strictly an internal relative path starting with '/' and not protocol-relative ('//')
    if (
      typeof redirect === 'string' &&
      redirect.startsWith('/') &&
      !redirect.startsWith('//') &&
      !redirect.includes('\\')
    ) {
      return redirect;
    }
  } catch {
    // Fall back to null if parsing fails
  }
  return null;
}

export default function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { login, isAuthenticated } = useAuth();

  const safeRedirect = getSafeRedirectUrl(location.search);

  const [formData, setFormData] = useState({
    email: location.state?.email || '',
    password: '',
  });

  const [errors, setErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [loginAlert, setLoginAlert] = useState(
    location.state?.message ? { type: 'info', message: location.state.message } : null
  );

  // If already authenticated, redirect safely away from login
  React.useEffect(() => {
    if (isAuthenticated) {
      navigate(safeRedirect || '/', { replace: true });
    }
  }, [isAuthenticated, navigate, safeRedirect]);

  const validate = () => {
    const newErrors = {};

    if (!formData.email.trim()) {
      newErrors.email = 'Email address is required.';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email.trim())) {
      newErrors.email = 'Please enter a valid email address.';
    }

    if (!formData.password) {
      newErrors.password = 'Password is required.';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (errors[name]) {
      setErrors((prev) => ({ ...prev, [name]: undefined }));
    }
    setLoginAlert(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;

    setIsSubmitting(true);
    setLoginAlert(null);

    try {
      const result = await login({
        email: formData.email.trim().toLowerCase(),
        password: formData.password,
      });

      if (result.success) {
        // Transition to onboarding if profile is new, or to safe return destination / discovery
        if (result.user?.onboardingCompleted === false) {
          navigate(safeRedirect ? `/onboarding?redirect=${encodeURIComponent(safeRedirect)}` : '/onboarding', { replace: true });
        } else {
          navigate(safeRedirect || '/', { replace: true });
        }
      }
    } catch (err) {
      if (err.isNetworkError) {
        setLoginAlert({
          type: 'warning',
          title: 'Backend Service Unavailable',
          message: 'The LinkUp API server (http://localhost:3000) could not be reached. Local validation passed, but server authentication requires the backend to be running.',
        });
      } else if (err.isUnauthorized) {
        setLoginAlert({
          type: 'error',
          title: 'Authentication Failed',
          message: 'Invalid email or password. Please verify your credentials and try again.',
        });
      } else {
        setLoginAlert({
          type: 'error',
          title: 'Login Error',
          message: err.message || 'Unable to log in. Please try again.',
        });
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="auth-page-root">
      <div className="auth-card-container">
        <div className="auth-card">
          <div className="auth-header">
            <Link to="/" className="auth-logo-badge" aria-label="LinkUp Home">
              <img src="/linkup-logo.svg" alt="LinkUp Logo" className="auth-logo-img" />
            </Link>
            <h1 className="auth-title">Welcome Back</h1>
            <p className="auth-subtitle">
              Sign in to manage your activities, plans, and meetup connections.
            </p>
          </div>

          {loginAlert && (
            <AlertBanner
              type={loginAlert.type}
              title={loginAlert.title}
              message={loginAlert.message}
            />
          )}

          <form onSubmit={handleSubmit} className="auth-form" noValidate>
            <FormInput
              id="email"
              name="email"
              label="Email Address"
              type="email"
              placeholder="you@student.edu or you@example.com"
              value={formData.email}
              onChange={handleChange}
              error={errors.email}
              required
              disabled={isSubmitting}
              autoComplete="email"
            />

            <FormInput
              id="password"
              name="password"
              label="Password"
              type="password"
              placeholder="Enter your password"
              value={formData.password}
              onChange={handleChange}
              error={errors.password}
              required
              disabled={isSubmitting}
              autoComplete="current-password"
            />

            <button
              type="submit"
              className="btn btn-primary btn-lg"
              style={{ width: '100%', marginTop: 'var(--space-2)' }}
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <span>Signing in...</span>
              ) : (
                <>
                  <LogIn size={18} aria-hidden="true" />
                  <span>Log In</span>
                </>
              )}
            </button>
          </form>

          <div className="auth-footer-links">
            <p style={{ marginBottom: 'var(--space-2)' }}>
              Don't have an account yet?{' '}
              <Link to={safeRedirect ? `/signup?redirect=${encodeURIComponent(safeRedirect)}` : "/signup"} className="auth-link">
                Sign up here
              </Link>
            </p>
            <p>
              <Link to="/verify-email" className="auth-link" style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                Need to verify your email with a code or link?
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
