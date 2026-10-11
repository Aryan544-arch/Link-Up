import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import AlertBanner from '../../components/common/AlertBanner';
import { normalizeApiError } from '../../lib/api';
import { updatePreferencesRequest } from '../../lib/authApi';
import { isSecureContextSupported, POPULAR_AREAS } from '../../lib/locationUtils';
import { 
  Compass, 
  MapPin, 
  ShieldCheck, 
  Bell, 
  CheckCircle2, 
  ArrowRight, 
  ArrowLeft,
  Navigation,
  Lock,
  Sparkles,
  Info
} from 'lucide-react';

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

const AVAILABLE_INTERESTS = [
  'Outdoor & Sports',
  'Study & Focus',
  'Fitness',
  'Social & Board Games',
  'Creative & Crafts',
  'Food & Coffee',
  'Music & Jamming',
  'Tech & Hackathons',
  'Hiking & Nature',
  'Photography',
  'Languages & Culture',
  'Volunteering',
];

export default function OnboardingPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const safeRedirect = getSafeRedirectUrl(location.search);

  // Current onboarding step: 1 = Interests, 2 = Location, 3 = Notifications, 4 = Review
  const [currentStep, setCurrentStep] = useState(1);

  // Form State
  const [selectedInterests, setSelectedInterests] = useState([]);
  const [locationMode, setLocationMode] = useState('manual'); // 'browser' | 'manual'
  const [manualArea, setManualArea] = useState('');
  const [browserLocationStatus, setBrowserLocationStatus] = useState(null); // 'granted' | 'denied' | 'requesting' | null
  const [browserCoords, setBrowserCoords] = useState(null); // { lat, lng } approximate
  const [searchRadiusKm] = useState(3); // Fixed 3 km default per PRD
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [emailDigestEnabled, setEmailDigestEnabled] = useState(false);

  // UI state
  const [stepError, setStepError] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [serverAlert, setServerAlert] = useState(null);

  // Toggle interest
  const toggleInterest = (interest) => {
    setSelectedInterests((prev) =>
      prev.includes(interest)
        ? prev.filter((i) => i !== interest)
        : [...prev, interest]
    );
    setStepError(null);
  };

  // Explicit browser geolocation trigger
  const requestBrowserLocation = () => {
    if (!isSecureContextSupported()) {
      setBrowserLocationStatus('denied');
      setLocationMode('manual');
      setStepError(
        'Browser geolocation requires HTTPS or localhost. On LAN HTTP (e.g. 10.162.61.69), please select your neighborhood manually below or visit via http://localhost:5173.'
      );
      return;
    }

    if (!navigator.geolocation) {
      setBrowserLocationStatus('denied');
      setLocationMode('manual');
      setStepError('Browser geolocation is not supported on this device. Please enter your preferred area manually.');
      return;
    }

    setBrowserLocationStatus('requesting');
    setStepError(null);

    navigator.geolocation.getCurrentPosition(
      (position) => {
        // Do NOT expose exact coordinates publicly; keep local approximate record
        setBrowserCoords({
          lat: Number(position.coords.latitude.toFixed(3)),
          lng: Number(position.coords.longitude.toFixed(3)),
        });
        setBrowserLocationStatus('granted');
        setLocationMode('browser');
      },
      (err) => {
        setBrowserLocationStatus('denied');
        setLocationMode('manual');
        setStepError(
          err.code === 1
            ? 'Location permission was denied. You can freely specify your neighborhood or campus area manually below.'
            : 'Unable to retrieve location. Please specify your area manually.'
        );
      },
      { timeout: 8000, enableHighAccuracy: false }
    );
  };

  // Step validation
  const validateStep = () => {
    setStepError(null);

    if (currentStep === 1) {
      if (selectedInterests.length === 0) {
        setStepError('Please select at least 1 interest to continue.');
        return false;
      }
    }

    if (currentStep === 2) {
      if (locationMode === 'manual' && !manualArea.trim()) {
        setStepError('Please enter your preferred neighborhood, campus, or town area.');
        return false;
      }
      if (locationMode === 'browser' && browserLocationStatus !== 'granted') {
        setStepError('Please grant location permission or switch to entering your area manually.');
        return false;
      }
    }

    return true;
  };

  const handleNext = () => {
    if (!validateStep()) return;
    setCurrentStep((prev) => Math.min(prev + 1, 4));
  };

  const handleBack = () => {
    setStepError(null);
    setCurrentStep((prev) => Math.max(prev - 1, 1));
  };

  // Final submission of onboarding preferences
  const handleComplete = async () => {
    setIsSubmitting(true);
    setServerAlert(null);

    // Privacy by Design (PRD §5 & §10): Do NOT persist exact private coordinates to profile preferences.
    // Exact GPS is only used as an ephemeral foreground query param for discovery, never stored on user document.
    const payload = {
      interests: selectedInterests,
      searchRadiusKm,
      preferredArea: locationMode === 'manual' ? manualArea.trim() : 'Current Location (Foreground)',
      notificationPreferences: {
        inApp: notificationsEnabled,
        email: emailDigestEnabled,
      },
      onboardingCompleted: true,
    };

    try {
      // Call isolated preferences endpoint per PRD Section 11
      await updatePreferencesRequest(payload);
      navigate(safeRedirect || '/', { replace: true });
    } catch (err) {
      const normalized = err.normalized || normalizeApiError(err);

      if (normalized.isNetworkError) {
        setServerAlert({
          type: 'warning',
          title: 'Backend Service Unavailable',
          message: 'The LinkUp API server (http://localhost:3000) could not be reached to save preferences. Local validation passed. Server integration is pending backend implementation.',
        });
      } else {
        setServerAlert({
          type: 'error',
          title: 'Submission Error',
          message: normalized.message || 'Unable to save onboarding preferences.',
        });
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="onboarding-page-root">
      <div className="onboarding-container">
        <div className="onboarding-card">
          {/* Step Progress Bar */}
          <div className="step-indicator" role="navigation" aria-label="Onboarding Progress">
            <div className="step-line" aria-hidden="true" />

            <div className={`step-item ${currentStep === 1 ? 'active' : currentStep > 1 ? 'completed' : ''}`}>
              <div className="step-bubble">1</div>
              <span className="step-label">Interests</span>
            </div>

            <div className={`step-item ${currentStep === 2 ? 'active' : currentStep > 2 ? 'completed' : ''}`}>
              <div className="step-bubble">2</div>
              <span className="step-label">Location</span>
            </div>

            <div className={`step-item ${currentStep === 3 ? 'active' : currentStep > 3 ? 'completed' : ''}`}>
              <div className="step-bubble">3</div>
              <span className="step-label">Preferences</span>
            </div>

            <div className={`step-item ${currentStep === 4 ? 'active' : ''}`}>
              <div className="step-bubble">4</div>
              <span className="step-label">Review</span>
            </div>
          </div>

          {stepError && (
            <AlertBanner type="error" message={stepError} />
          )}

          {serverAlert && (
            <AlertBanner
              type={serverAlert.type}
              title={serverAlert.title}
              message={serverAlert.message}
            />
          )}

          {/* ================= STEP 1: INTERESTS ================= */}
          {currentStep === 1 && (
            <div>
              <div className="step-header">
                <h1 className="step-title">What do you enjoy doing?</h1>
                <p className="step-desc">
                  Select activities and topics you are interested in. LinkUp will use these to suggest meetups near you.
                </p>
              </div>

              <div className="interests-grid" role="group" aria-label="Select interests">
                {AVAILABLE_INTERESTS.map((interest) => {
                  const isSelected = selectedInterests.includes(interest);
                  return (
                    <button
                      key={interest}
                      type="button"
                      className={`interest-pill-btn ${isSelected ? 'selected' : ''}`}
                      onClick={() => toggleInterest(interest)}
                      aria-pressed={isSelected}
                    >
                      {isSelected && <CheckCircle2 size={14} aria-hidden="true" />}
                      <span>{interest}</span>
                    </button>
                  );
                })}
              </div>

              <div style={{ textAlign: 'center', fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)' }}>
                {selectedInterests.length === 0 ? (
                  <span>Select at least 1 interest to continue</span>
                ) : (
                  <span><strong>{selectedInterests.length}</strong> selected</span>
                )}
              </div>
            </div>
          )}

          {/* ================= STEP 2: LOCATION ================= */}
          {currentStep === 2 && (
            <div>
              <div className="step-header">
                <h1 className="step-title">Location &amp; Discovery Radius</h1>
                <p className="step-desc">
                  LinkUp connects you with people and activities happening close to you.
                </p>
              </div>

              {/* Privacy Notice Card */}
              <div className="privacy-callout-card" role="note">
                <Lock size={18} style={{ color: 'var(--color-forest-green)', flexShrink: 0 }} aria-hidden="true" />
                <div>
                  <strong>Privacy by Design:</strong>
                  <p style={{ marginTop: '2px', lineHeight: '1.4' }}>
                    Browser location is strictly optional. We use a default <strong>3 km radius</strong> to find local meetups. 
                    We never expose exact private coordinates or track you in the background.
                  </p>
                </div>
              </div>

              <div className="location-cards-group">
                {/* Option A: Browser Geolocation */}
                <div className={`location-option-card ${locationMode === 'browser' ? 'active' : ''}`}>
                  <div className="location-option-header">
                    <div className="location-option-icon">
                      <Navigation size={18} aria-hidden="true" />
                    </div>
                    <div>
                      <h3 className="location-option-title">Use Browser Geolocation</h3>
                      <p className="location-option-desc">
                        Detect approximate foreground location while the app is open.
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    className={`btn ${browserLocationStatus === 'granted' ? 'btn-secondary' : 'btn-outline'} btn-sm`}
                    onClick={requestBrowserLocation}
                    disabled={browserLocationStatus === 'requesting'}
                  >
                    <Compass size={14} aria-hidden="true" />
                    <span>
                      {browserLocationStatus === 'requesting'
                        ? 'Requesting permission...'
                        : browserLocationStatus === 'granted'
                        ? '✓ Location Permission Granted'
                        : 'Enable Browser Location'}
                    </span>
                  </button>

                  {browserLocationStatus === 'granted' && (
                    <span className="badge badge-forest" style={{ marginLeft: 'var(--space-2)' }}>
                      📍 Active · 3 km discovery radius
                    </span>
                  )}
                </div>

                {/* Option B: Manual Area Fallback */}
                <div className={`location-option-card ${locationMode === 'manual' ? 'active' : ''}`}>
                  <div className="location-option-header">
                    <div className="location-option-icon">
                      <MapPin size={18} aria-hidden="true" />
                    </div>
                    <div>
                      <h3 className="location-option-title">Manual Area Fallback (No GPS needed)</h3>
                      <p className="location-option-desc">
                        Specify your campus, neighborhood, or city name.
                      </p>
                    </div>
                  </div>

                  <div className="form-group">
                    <label htmlFor="manualAreaInput" className="form-label">
                      Neighborhood or Campus Name
                    </label>
                    <input
                      id="manualAreaInput"
                      type="text"
                      className="input"
                      placeholder="e.g. University North Campus, West End, Downtown"
                      value={manualArea}
                      onChange={(e) => {
                        setManualArea(e.target.value);
                        setLocationMode('manual');
                        setStepError(null);
                      }}
                    />
                    <div style={{ marginTop: 'var(--space-2)', display: 'flex', flexWrap: 'wrap', gap: 'var(--space-1)' }}>
                      <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-muted)', marginRight: 'var(--space-1)', alignSelf: 'center' }}>
                        Suggestions:
                      </span>
                      {POPULAR_AREAS.slice(0, 5).map((area) => (
                        <button
                          key={area.name}
                          type="button"
                          className="btn btn-ghost btn-xs"
                          style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '12px', border: '1px solid var(--border-color)' }}
                          onClick={() => {
                            setManualArea(area.displayArea);
                            setLocationMode('manual');
                            setStepError(null);
                          }}
                        >
                          📍 {area.displayArea.split(',')[0]}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              <div style={{ padding: 'var(--space-3)', background: 'var(--bg-surface-subtle)', borderRadius: 'var(--radius-md)', fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)' }}>
                <span>Default search radius: <strong>{searchRadiusKm} km</strong> (you can adjust this anytime in Settings).</span>
              </div>
            </div>
          )}

          {/* ================= STEP 3: PREFERENCES ================= */}
          {currentStep === 3 && (
            <div>
              <div className="step-header">
                <h1 className="step-title">Community &amp; Notifications</h1>
                <p className="step-desc">
                  Stay updated on join requests, proposals, and nearby activities.
                </p>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)', marginBottom: 'var(--space-6)' }}>
                {/* In-app Notification Toggle */}
                <label className="location-option-card" style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={notificationsEnabled}
                    onChange={(e) => setNotificationsEnabled(e.target.checked)}
                    className="form-checkbox"
                  />
                  <div>
                    <h3 className="location-option-title" style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                      <Bell size={16} aria-hidden="true" />
                      In-App Notifications (Recommended)
                    </h3>
                    <p className="location-option-desc" style={{ margin: 0 }}>
                      Receive alerts when organizers respond to join requests or when deterministic match proposals arrive.
                    </p>
                  </div>
                </label>

                {/* Email Digest Toggle */}
                <label className="location-option-card" style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={emailDigestEnabled}
                    onChange={(e) => setEmailDigestEnabled(e.target.checked)}
                    className="form-checkbox"
                  />
                  <div>
                    <h3 className="location-option-title">
                      Email Updates (Optional)
                    </h3>
                    <p className="location-option-desc" style={{ margin: 0 }}>
                      Receive occasional summaries when compatible activities are published nearby.
                    </p>
                  </div>
                </label>

                {/* Community Code of Conduct */}
                <div style={{ padding: 'var(--space-4)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', background: 'var(--bg-surface)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: 'var(--space-1)', color: 'var(--color-forest-green)', fontWeight: 700, fontSize: 'var(--font-size-sm)' }}>
                    <ShieldCheck size={16} aria-hidden="true" />
                    <span>The LinkUp Promise</span>
                  </div>
                  <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                    LinkUp is built for real-world connection. We believe in showing up, treating organizers and participants with respect, and clear communication. Match suggestions never commit your attendance automatically.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* ================= STEP 4: REVIEW & FINISH ================= */}
          {currentStep === 4 && (
            <div>
              <div className="step-header">
                <h1 className="step-title">Review Your Selections</h1>
                <p className="step-desc">
                  Confirm your onboarding setup. You can change these anytime in Settings.
                </p>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', marginBottom: 'var(--space-6)' }}>
                {/* Review Interests */}
                <div style={{ padding: 'var(--space-4)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', background: 'var(--bg-surface-subtle)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-2)' }}>
                    <span style={{ fontSize: 'var(--font-size-xs)', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)' }}>
                      Selected Interests ({selectedInterests.length})
                    </span>
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => setCurrentStep(1)}>
                      Edit
                    </button>
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-1)' }}>
                    {selectedInterests.map((i) => (
                      <span key={i} className="badge badge-forest">{i}</span>
                    ))}
                  </div>
                </div>

                {/* Review Location */}
                <div style={{ padding: 'var(--space-4)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', background: 'var(--bg-surface-subtle)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-2)' }}>
                    <span style={{ fontSize: 'var(--font-size-xs)', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)' }}>
                      Discovery Location &amp; Radius
                    </span>
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => setCurrentStep(2)}>
                      Edit
                    </button>
                  </div>
                  <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text-primary)', margin: 0 }}>
                    {locationMode === 'browser' ? (
                      <>📍 Browser Geolocation (Foreground) · <strong>{searchRadiusKm} km radius</strong></>
                    ) : (
                      <>📍 Manual Area: <strong>{manualArea}</strong> · <strong>{searchRadiusKm} km radius</strong></>
                    )}
                  </p>
                </div>

                {/* Review Notifications */}
                <div style={{ padding: 'var(--space-4)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', background: 'var(--bg-surface-subtle)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-2)' }}>
                    <span style={{ fontSize: 'var(--font-size-xs)', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)' }}>
                      Notification Preferences
                    </span>
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => setCurrentStep(3)}>
                      Edit
                    </button>
                  </div>
                  <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text-primary)', margin: 0 }}>
                    In-app alerts: {notificationsEnabled ? 'Enabled' : 'Disabled'} · Email updates: {emailDigestEnabled ? 'Enabled' : 'Disabled'}
                  </p>
                </div>
              </div>

              {serverAlert && (
                <div style={{ textAlign: 'center', marginBottom: 'var(--space-4)' }}>
                  <button 
                    type="button" 
                    className="btn btn-outline btn-sm"
                    onClick={() => navigate('/')}
                  >
                    <span>Proceed to Discovery anyway (Local Mode)</span>
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Navigation Controls (Back / Continue) */}
          <div className="onboarding-actions">
            {currentStep > 1 ? (
              <button
                type="button"
                className="btn btn-outline"
                onClick={handleBack}
                disabled={isSubmitting}
              >
                <ArrowLeft size={16} aria-hidden="true" />
                <span>Back</span>
              </button>
            ) : (
              <div /> // Spacer
            )}

            {currentStep < 4 ? (
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleNext}
              >
                <span>Continue</span>
                <ArrowRight size={16} aria-hidden="true" />
              </button>
            ) : (
              <button
                type="button"
                className="btn btn-accent btn-lg"
                onClick={handleComplete}
                disabled={isSubmitting}
              >
                {isSubmitting ? (
                  <span>Saving Preferences...</span>
                ) : (
                  <>
                    <CheckCircle2 size={18} aria-hidden="true" />
                    <span>Complete Onboarding</span>
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
