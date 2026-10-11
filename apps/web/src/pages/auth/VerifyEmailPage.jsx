import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import FormInput from '../../components/common/FormInput';
import AlertBanner from '../../components/common/AlertBanner';
import { useAuth } from '../../context/AuthContext';
import { normalizeApiError } from '../../lib/api';
import { verifyEmailRequest } from '../../lib/authApi';
import { Mail, CheckCircle2, ArrowRight, RefreshCw, Terminal } from 'lucide-react';

export default function VerifyEmailPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { refreshUser } = useAuth();

  // If token is provided in URL (e.g. /verify-email?token=xyz)
  const queryToken = searchParams.get('token') || '';
  const initialEmail = location.state?.email || '';
  const initialDevToken = location.state?.devToken || '';
  const emailDelivered = Boolean(location.state?.emailDelivered);

  const [verificationCode, setVerificationCode] = useState(queryToken || initialDevToken);
  const [email] = useState(initialEmail);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [alertState, setAlertState] = useState(
    location.state?.message ? { type: 'info', message: location.state.message } : null
  );

  // Auto-submit if token is present in URL
  useEffect(() => {
    if (queryToken && queryToken.length > 3) {
      handleVerify(queryToken);
    }
  }, [queryToken]);

  const handleVerify = async (codeToVerify) => {
    const code = (codeToVerify || verificationCode).trim();
    if (!code) {
      setAlertState({
        type: 'error',
        title: 'Input Required',
        message: 'Please enter the verification code or token sent to your email.',
      });
      return;
    }

    setIsSubmitting(true);
    setAlertState(null);

    try {
      // Execute email verification via POST /api/auth/verify-email
      const response = await verifyEmailRequest({
        token: code,
        email: email || undefined,
      });

      setAlertState({
        type: 'success',
        title: 'Email Verified',
        message: response.data?.message || 'Your email has been verified successfully!',
      });

      // Refresh AuthContext to establish the authenticated session
      if (typeof refreshUser === 'function') {
        try {
          await refreshUser();
        } catch (_) {
          // Non-blocking if session is being processed
        }
      }

      // Transition to onboarding or home
      setTimeout(() => {
        navigate('/onboarding', { state: { emailVerified: true } });
      }, 1200);
    } catch (err) {
      const normalized = err.normalized || normalizeApiError(err);
      
      if (normalized.isNetworkError) {
        setAlertState({
          type: 'warning',
          title: 'Backend Service Unavailable',
          message: 'The LinkUp API server (http://localhost:3000) could not be reached to verify this code. Real verification requires backend service startup.',
        });
      } else {
        setAlertState({
          type: 'error',
          title: 'Verification Failed',
          message: normalized.message || 'Invalid or expired verification code.',
        });
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleManualSubmit = (e) => {
    e.preventDefault();
    handleVerify(verificationCode);
  };

  return (
    <div className="auth-page-root">
      <div className="auth-card-container">
        <div className="auth-card">
          <div className="auth-header">
            <div className="auth-logo-badge" style={{ backgroundColor: 'var(--color-soft-sage-subtle)', borderRadius: 'var(--radius-full)', padding: 'var(--space-3)' }}>
              <Mail size={32} style={{ color: 'var(--color-forest-green)' }} aria-hidden="true" />
            </div>
            <h1 className="auth-title">Verify Your Email</h1>
            <p className="auth-subtitle">
              {emailDelivered && email ? (
                <>We sent a single-use verification code to <strong>{email}</strong>.</>
              ) : email ? (
                <>Verification is required for <strong>{email}</strong>. In local dev, use the generated token below.</>
              ) : (
                <>Enter the verification code or token from your confirmation email.</>
              )}
            </p>
          </div>

          {/* Development Helper Banner */}
          {initialDevToken && (
            <div style={{
              background: '#f0fdf4',
              border: '1px solid #86efac',
              borderRadius: 'var(--radius-md)',
              padding: 'var(--space-3)',
              marginBottom: 'var(--space-4)',
              fontSize: 'var(--font-size-sm)',
              color: '#166534'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                <CheckCircle2 size={16} />
                <strong>Local Development Helper:</strong>
              </div>
              <p style={{ margin: '0 0 8px 0', fontSize: 'var(--font-size-xs)' }}>
                SMTP email is not configured locally. Your single-use verification token is ready:
              </p>
              <code style={{ display: 'block', wordBreak: 'break-all', background: '#dcfce7', padding: '6px 8px', borderRadius: '4px', marginBottom: '8px', fontSize: '11px' }}>
                {initialDevToken}
              </code>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => handleVerify(initialDevToken)}
                disabled={isSubmitting}
              >
                <span>One-Click Verify &amp; Continue</span>
              </button>
            </div>
          )}

          {alertState && (
            <AlertBanner
              type={alertState.type}
              title={alertState.title}
              message={alertState.message}
            />
          )}

          <form onSubmit={handleManualSubmit} className="auth-form" noValidate>
            <FormInput
              id="verificationCode"
              name="verificationCode"
              label="Verification Code / Token"
              type="text"
              placeholder="e.g. 64-character verification token"
              value={verificationCode}
              onChange={(e) => {
                setVerificationCode(e.target.value);
                setAlertState(null);
              }}
              helperText="Single-use, time-limited verification token"
              required
              disabled={isSubmitting}
            />

            <button
              type="submit"
              className="btn btn-primary btn-lg"
              style={{ width: '100%', marginTop: 'var(--space-2)' }}
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <span>Verifying...</span>
              ) : (
                <>
                  <CheckCircle2 size={18} aria-hidden="true" />
                  <span>Verify Email</span>
                </>
              )}
            </button>
          </form>

          <div style={{ marginTop: 'var(--space-6)', padding: 'var(--space-4)', background: 'var(--bg-surface-subtle)', borderRadius: 'var(--radius-md)', fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)' }}>
            <p style={{ marginBottom: '4px' }}><strong>Email Verification:</strong> Verified accounts protect community safety. Tokens expire in 24 hours.</p>
            <p>In local development without an SMTP server, tokens are logged to the backend console.</p>
          </div>

          <div className="auth-footer-links">
            <p>
              Already verified?{' '}
              <Link to="/login" className="auth-link">
                Sign in to your account
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
