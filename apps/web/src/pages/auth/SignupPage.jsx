import React, { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import FormInput from '../../components/common/FormInput';
import AlertBanner from '../../components/common/AlertBanner';
import { normalizeApiError } from '../../lib/api';
import { registerRequest } from '../../lib/authApi';
import { UserPlus, ArrowRight, ShieldCheck } from 'lucide-react';

function getSafeRedirectUrl(search) {
  try {
    const params = new URLSearchParams(search);
    const redirect = params.get('redirect');
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

export default function SignupPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const safeRedirect = getSafeRedirectUrl(location.search);

  const [formData, setFormData] = useState({
    displayName: '',
    email: '',
    password: '',
    confirmPassword: '',
    termsAccepted: false,
  });

  const [errors, setErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitAlert, setSubmitAlert] = useState(null);

  const validate = () => {
    const newErrors = {};

    if (!formData.displayName.trim()) {
      newErrors.displayName = 'Display name is required.';
    } else if (formData.displayName.trim().length < 2) {
      newErrors.displayName = 'Display name must be at least 2 characters.';
    }

    if (!formData.email.trim()) {
      newErrors.email = 'Email address is required.';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email.trim())) {
      newErrors.email = 'Please enter a valid email address.';
    }

    if (!formData.password) {
      newErrors.password = 'Password is required.';
    } else if (formData.password.length < 8) {
      newErrors.password = 'Password must be at least 8 characters long.';
    }

    if (!formData.confirmPassword) {
      newErrors.confirmPassword = 'Please confirm your password.';
    } else if (formData.password !== formData.confirmPassword) {
      newErrors.confirmPassword = 'Passwords do not match.';
    }

    if (!formData.termsAccepted) {
      newErrors.termsAccepted = 'You must accept the community terms to register.';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }));
    // Clear field-specific error as user types
    if (errors[name]) {
      setErrors((prev) => ({ ...prev, [name]: undefined }));
    }
    setSubmitAlert(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;

    setIsSubmitting(true);
    setSubmitAlert(null);

    try {
      // Call isolated registration endpoint per PRD Section 11
      const response = await registerRequest({
        displayName: formData.displayName.trim(),
        email: formData.email.trim().toLowerCase(),
        password: formData.password,
      });

      // Successful registration: transition to email verification
      navigate('/verify-email', { 
        state: { 
          email: formData.email.trim().toLowerCase(),
          message: response.data?.message || 'Registration submitted! Please verify your email.' 
        } 
      });
    } catch (err) {
      const normalized = err.normalized || normalizeApiError(err);
      
      if (normalized.isNetworkError) {
        setSubmitAlert({
          type: 'warning',
          title: 'Backend Service Unavailable',
          message: 'The LinkUp API server (http://localhost:3000) could not be reached. Local validation passed, but server registration is pending backend startup.',
        });
      } else {
        setSubmitAlert({
          type: 'error',
          title: 'Registration Failed',
          message: normalized.message,
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
            <h1 className="auth-title">Join LinkUp</h1>
            <p className="auth-subtitle">
              Connect with real people and join activities in your neighborhood.
            </p>
          </div>

          {submitAlert && (
            <AlertBanner
              type={submitAlert.type}
              title={submitAlert.title}
              message={submitAlert.message}
            />
          )}

          <form onSubmit={handleSubmit} className="auth-form" noValidate>
            <FormInput
              id="displayName"
              name="displayName"
              label="Display Name"
              type="text"
              placeholder="e.g. Alex Rivera"
              value={formData.displayName}
              onChange={handleChange}
              error={errors.displayName}
              helperText="How other participants will see your name"
              required
              disabled={isSubmitting}
              autoComplete="name"
            />

            <FormInput
              id="email"
              name="email"
              label="Email Address"
              type="email"
              placeholder="you@student.edu or you@example.com"
              value={formData.email}
              onChange={handleChange}
              error={errors.email}
              helperText="We will send a single-use verification link or code"
              required
              disabled={isSubmitting}
              autoComplete="email"
            />

            <FormInput
              id="password"
              name="password"
              label="Password"
              type="password"
              placeholder="Minimum 8 characters"
              value={formData.password}
              onChange={handleChange}
              error={errors.password}
              required
              disabled={isSubmitting}
              autoComplete="new-password"
            />

            <FormInput
              id="confirmPassword"
              name="confirmPassword"
              label="Confirm Password"
              type="password"
              placeholder="Re-type your password"
              value={formData.confirmPassword}
              onChange={handleChange}
              error={errors.confirmPassword}
              required
              disabled={isSubmitting}
              autoComplete="new-password"
            />

            {/* Terms and Privacy Checkbox */}
            <div className="form-group">
              <label className="form-checkbox-row" htmlFor="termsAccepted">
                <input
                  type="checkbox"
                  name="termsAccepted"
                  id="termsAccepted"
                  checked={formData.termsAccepted}
                  onChange={handleChange}
                  className="form-checkbox"
                  disabled={isSubmitting}
                  aria-invalid={!!errors.termsAccepted}
                  aria-describedby={errors.termsAccepted ? 'termsAccepted-error' : undefined}
                />
                <span>
                  I agree to LinkUp's real-world meetup principles, privacy policy, and community code of conduct.
                </span>
              </label>
              {errors.termsAccepted && (
                <p id="termsAccepted-error" className="form-error-msg" role="alert">
                  {errors.termsAccepted}
                </p>
              )}
            </div>

            <button
              type="submit"
              className="btn btn-primary btn-lg"
              style={{ width: '100%', marginTop: 'var(--space-2)' }}
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <span>Creating Account...</span>
              ) : (
                <>
                  <UserPlus size={18} aria-hidden="true" />
                  <span>Create Account</span>
                </>
              )}
            </button>
          </form>

          <div className="auth-footer-links">
            <p>
              Already have an account?{' '}
              <Link to={safeRedirect ? `/login?redirect=${encodeURIComponent(safeRedirect)}` : "/login"} className="auth-link">
                Log in here
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
