import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import FormInput from '../../components/common/FormInput';
import AlertBanner from '../../components/common/AlertBanner';
import { normalizeApiError } from '../../lib/api';
import { verifyEmailRequest } from '../../lib/authApi';
import { Mail, CheckCircle2, ArrowRight, RefreshCw } from 'lucide-react';

export default function VerifyEmailPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();

  // If token is provided in URL (e.g. /verify-email?token=xyz)
  const queryToken = searchParams.get('token') || '';
  const initialEmail = location.state?.email || '';

  const [verificationCode, setVerificationCode] = useState(queryToken);
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
      // Isolate behind dedicated integration function (Contract status: UNRESOLVED per PRD §16 Decision 4)
      const response = await verifyEmailRequest({
        token: code,
        email: email || undefined,
      });

      setAlertState({
        type: 'success',
        title: 'Email Verified',
        message: response.data?.message || 'Your email has been verified successfully!',
      });

      // Transition to onboarding or login
      setTimeout(() => {
        navigate('/onboarding', { state: { emailVerified: true } });
      }, 1500);
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
              {email ? (
                <>We sent a single-use verification code to <strong>{email}</strong>.</>
              ) : (
                <>Enter the verification code or token from your confirmation email.</>
              )}
            </p>
          </div>

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
              placeholder="e.g. 123456 or verification token"
              value={verificationCode}
              onChange={(e) => {
                setVerificationCode(e.target.value);
                setAlertState(null);
              }}
              helperText="Single-use, time-limited verification code"
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
            <p style={{ marginBottom: '4px' }}><strong>Contract Status:</strong> Open Decision 4 in PRD §16 (Email verification via link vs OTP) is pending Person 3's backend implementation.</p>
            <p>Verification requests are isolated in <code>authApi.js</code>. Real verification will succeed once Person 3 commits the endpoint and email provider.</p>
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
