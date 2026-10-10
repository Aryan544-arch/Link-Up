import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { createActivity, publishActivity } from '../../lib/activityApi';
import { normalizeApiError } from '../../lib/api';
import FormInput from '../../components/common/FormInput';
import AlertBanner from '../../components/common/AlertBanner';
import {
  PlusCircle,
  Calendar,
  Clock,
  MapPin,
  DollarSign,
  Users,
  Sparkles,
  ShieldCheck,
  CheckCircle2,
  Lock,
  ArrowRight,
  ArrowLeft,
  Info,
  LogIn,
  Check,
  Navigation,
  Upload,
  AlertTriangle,
  RefreshCw
} from 'lucide-react';

const CATEGORIES = [
  'Outdoor & Sports',
  'Study & Focus',
  'Fitness',
  'Social & Board Games',
  'Creative & Crafts',
  'Food & Coffee',
  'Music & Jamming',
  'General Meetup',
];

const DURATIONS = [
  '30 minutes',
  '1 hour',
  '1.5 hours',
  '2 hours',
  '2.5 hours',
  '3 hours',
  'Half day (4+ hours)',
];

const SKILL_LEVELS = [
  'All skill levels welcome',
  'Beginner friendly',
  'Intermediate',
  'Advanced / Experienced',
];

function calculateEndsAt(startDate, durationStr) {
  let minutes = 90; // default 1.5 hours
  if (durationStr === '30 minutes') minutes = 30;
  else if (durationStr === '1 hour') minutes = 60;
  else if (durationStr === '1.5 hours') minutes = 90;
  else if (durationStr === '2 hours') minutes = 120;
  else if (durationStr === '2.5 hours') minutes = 150;
  else if (durationStr === '3 hours') minutes = 180;
  else if (durationStr === 'Half day (4+ hours)') minutes = 240;

  return new Date(startDate.getTime() + minutes * 60 * 1000).toISOString();
}

export default function CreateActivityPage() {
  const navigate = useNavigate();
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();

  // Form State
  const [formData, setFormData] = useState({
    title: '',
    category: 'Outdoor & Sports',
    description: '',
    date: '',
    time: '',
    duration: '1.5 hours',
    displayArea: '',
    budgetType: 'free', // 'free' | 'paid'
    costDetails: '',
    capacity: 6,
    skillLevel: 'All skill levels welcome',
    approvalRequired: true,
    rules: '',
  });

  // Coordinates State (Required by backend GeoJSON Point)
  const [coords, setCoords] = useState(null); // { lat, lng }
  const [manualCoords, setManualCoords] = useState({ lat: '', lng: '' });
  const [showManualCoords, setShowManualCoords] = useState(false);
  const [coordStatus, setCoordStatus] = useState('idle'); // 'idle' | 'locating' | 'acquired' | 'failed'
  const [coordError, setCoordError] = useState(null);

  const [errors, setErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);

  // Separate Draft Creation and Publishing States (Step 6)
  const [creationStep, setCreationStep] = useState('form'); // 'form' | 'draft_created' | 'published'
  const [draftActivity, setDraftActivity] = useState(null);
  const [isPublishing, setIsPublishing] = useState(false);
  const [publishError, setPublishError] = useState(null);

  // Field change handler
  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }));

    if (errors[name]) {
      setErrors((prev) => ({ ...prev, [name]: undefined }));
    }
    setSubmitError(null);
  };

  // Acquire coordinates from browser geolocation
  const handleAcquireLocation = () => {
    if (!navigator.geolocation) {
      setCoordStatus('failed');
      setCoordError('Geolocation is not supported by your browser. Please enter coordinates manually.');
      setShowManualCoords(true);
      return;
    }

    setCoordStatus('locating');
    setCoordError(null);

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const acquired = {
          lat: Number(pos.coords.latitude.toFixed(6)),
          lng: Number(pos.coords.longitude.toFixed(6)),
        };
        setCoords(acquired);
        setManualCoords({ lat: String(acquired.lat), lng: String(acquired.lng) });
        setCoordStatus('acquired');
        if (errors.coords) {
          setErrors((prev) => ({ ...prev, coords: undefined }));
        }
      },
      (err) => {
        setCoordStatus('failed');
        setCoordError(
          err.code === 1
            ? 'Browser location permission was denied. Please enter coordinates manually below.'
            : 'Unable to retrieve GPS coordinates. Please enter coordinates manually.'
        );
        setShowManualCoords(true);
      },
      { timeout: 10000, enableHighAccuracy: true }
    );
  };

  const handleApplyManualCoords = () => {
    const latNum = parseFloat(manualCoords.lat);
    const lngNum = parseFloat(manualCoords.lng);

    if (isNaN(latNum) || latNum < -90 || latNum > 90) {
      setCoordError('Latitude must be a valid number between -90 and 90.');
      return;
    }
    if (isNaN(lngNum) || lngNum < -180 || lngNum > 180) {
      setCoordError('Longitude must be a valid number between -180 and 180.');
      return;
    }

    setCoords({ lat: latNum, lng: lngNum });
    setCoordStatus('acquired');
    setCoordError(null);
    if (errors.coords) {
      setErrors((prev) => ({ ...prev, coords: undefined }));
    }
  };

  // Form validation
  const validate = () => {
    const newErrors = {};

    if (!formData.title.trim()) {
      newErrors.title = 'Activity title is required.';
    } else if (formData.title.trim().length < 4) {
      newErrors.title = 'Title must be at least 4 characters long.';
    } else if (formData.title.trim().length > 100) {
      newErrors.title = 'Title cannot exceed 100 characters.';
    }

    if (!formData.category) {
      newErrors.category = 'Please select a category.';
    }

    if (!formData.description.trim()) {
      newErrors.description = 'Activity description is required.';
    } else if (formData.description.trim().length < 20) {
      newErrors.description = 'Please provide a more descriptive summary (at least 20 characters).';
    } else if (formData.description.trim().length > 2000) {
      newErrors.description = 'Description cannot exceed 2000 characters.';
    }

    // Date & Time Validation
    if (!formData.date) {
      newErrors.date = 'Scheduled date is required.';
    }

    if (!formData.time) {
      newErrors.time = 'Start time is required.';
    }

    if (formData.date && formData.time) {
      const scheduledDateTime = new Date(`${formData.date}T${formData.time}`);
      const now = new Date();
      if (isNaN(scheduledDateTime.getTime())) {
        newErrors.date = 'Invalid date or time format.';
      } else if (scheduledDateTime < now) {
        newErrors.date = 'Activity scheduled time must be in the future.';
      }
    }

    if (!formData.displayArea.trim()) {
      newErrors.displayArea = 'General meeting area or landmark is required.';
    } else if (formData.displayArea.trim().length < 3) {
      newErrors.displayArea = 'Area name must be at least 3 characters.';
    } else if (formData.displayArea.trim().length > 120) {
      newErrors.displayArea = 'Area name cannot exceed 120 characters.';
    }

    // Capacity Validation
    const capNum = Number(formData.capacity);
    if (!formData.capacity || isNaN(capNum)) {
      newErrors.capacity = 'Capacity is required.';
    } else if (!Number.isInteger(capNum)) {
      newErrors.capacity = 'Capacity must be a whole number.';
    } else if (capNum < 2) {
      newErrors.capacity = 'Group capacity must be at least 2 people (including yourself).';
    } else if (capNum > 100) {
      newErrors.capacity = 'Capacity cannot exceed 100 people.';
    }

    // Coordinates requirement (Step 6: Never invent fake coordinates)
    if (!coords || typeof coords.lat !== 'number' || typeof coords.lng !== 'number') {
      newErrors.coords = 'Precise location coordinates [longitude, latitude] are required by the backend to create an activity. Please acquire browser location or enter coordinates below.';
    }

    // Cost details validation if paid
    if (formData.budgetType === 'paid' && !formData.costDetails.trim()) {
      newErrors.costDetails = 'Please specify the expected cost or split amount (e.g. "$5 per person").';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // Draft Creation Handler (POST /api/activities)
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);

    const startDate = new Date(`${formData.date}T${formData.time}`);
    const startsAt = startDate.toISOString();
    const endsAt = calculateEndsAt(startDate, formData.duration);

    // Prepare verified payload conforming to Step 6:
    // GeoJSON Point coordinates order: [longitude, latitude]
    // Server-managed fields (organizerId, status, placesFilled) are strictly omitted.
    const payload = {
      title: formData.title.trim(),
      category: formData.category,
      description: formData.description.trim(),
      displayArea: formData.displayArea.trim(),
      startsAt,
      endsAt,
      capacity: Number(formData.capacity),
      location: {
        type: 'Point',
        coordinates: [Number(coords.lng), Number(coords.lat)], // [longitude, latitude] order
      },
      budget: formData.budgetType === 'free' ? 'Free' : formData.costDetails.trim(),
      skillLevel: formData.skillLevel,
      approvalRequired: formData.approvalRequired,
      rules: formData.rules.trim()
        ? formData.rules.split('\n').map((r) => r.trim()).filter(Boolean)
        : [],
    };

    try {
      const response = await createActivity(payload);
      setDraftActivity(response);
      setCreationStep('draft_created');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      // User-entered form values are preserved in state
      const normalized = err.normalized || normalizeApiError(err);
      setSubmitError(normalized);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Explicit Publishing Operation (POST /api/activities/:id/publish)
  const handlePublish = async () => {
    const draftId = draftActivity?.id || draftActivity?._id;
    if (!draftId || isPublishing) return;

    setIsPublishing(true);
    setPublishError(null);

    try {
      const published = await publishActivity(draftId);
      setDraftActivity(published);
      setCreationStep('published');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      // Draft ID is preserved, activity remains unpublished
      const normalized = err.normalized || normalizeApiError(err);
      setPublishError(normalized);
    } finally {
      setIsPublishing(false);
    }
  };

  // 1. Loading Authentication State
  if (authLoading) {
    return (
      <div className="create-activity-root">
        <div className="create-activity-container" aria-busy="true" aria-label="Loading authentication">
          <div className="skeleton-bar" style={{ width: '160px', height: '24px', margin: '0 auto var(--space-6)' }} />
          <div className="skeleton-card" style={{ minHeight: '360px', borderRadius: 'var(--radius-xl)' }} />
        </div>
      </div>
    );
  }

  // 2. Unauthenticated Gatekeeper State
  if (!isAuthenticated) {
    return (
      <div className="create-activity-root">
        <div className="create-activity-container">
          <div className="auth-gate-card" role="region" aria-label="Sign In Required to Create Activity">
            <div className="auth-gate-icon-bubble" aria-hidden="true">
              <PlusCircle size={32} />
            </div>

            <h1 className="auth-gate-title">Host a Meetup on LinkUp</h1>
            <p className="auth-gate-desc">
              Bring students and neighbors together for real-world activities. 
              You need a verified LinkUp account to organize and manage published meetups.
            </p>

            <div className="auth-gate-actions">
              <Link to="/login?redirect=/create" className="btn btn-primary btn-lg">
                <LogIn size={18} aria-hidden="true" />
                <span>Sign In to Continue</span>
              </Link>

              <Link to="/signup?redirect=/create" className="btn btn-outline btn-lg">
                <span>Create an Account</span>
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // 3. Step 6 Distinct State: Draft Created (Unpublished)
  if (creationStep === 'draft_created' && draftActivity) {
    const draftId = draftActivity.id || draftActivity._id;

    return (
      <div className="create-activity-root">
        <div className="create-activity-container">
          <div className="creation-success-card" role="region" aria-label="Draft Activity Created">
            <div className="creation-success-icon" style={{ backgroundColor: '#fef3c7', color: '#b45309' }} aria-hidden="true">
              <Sparkles size={36} />
            </div>

            <div className="badge badge-yellow" style={{ margin: '0 auto var(--space-2)', display: 'inline-flex' }}>
              Status: Draft (Unpublished)
            </div>

            <h1 className="create-title" style={{ marginBottom: 'var(--space-2)' }}>
              Activity Draft Created
            </h1>

            <p className="create-subtitle" style={{ maxWidth: '520px', margin: '0 auto var(--space-6)' }}>
              Your meetup <strong>"{formData.title}"</strong> has been saved as a draft.
              It is not visible in public discovery until you explicitly publish it.
            </p>

            {publishError && (
              <div style={{ maxWidth: '560px', margin: '0 auto var(--space-6)', textAlign: 'left' }}>
                <AlertBanner
                  type="error"
                  title="Publishing Failed"
                  message={
                    publishError.message
                      ? `${publishError.message}. Your activity draft is safely preserved (Draft ID: ${draftId}) and remains unpublished.`
                      : `The publish endpoint returned an error. Your activity draft is safely saved (Draft ID: ${draftId}) and remains unpublished.`
                  }
                />
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'center', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
              <button
                type="button"
                className="btn btn-primary btn-lg"
                onClick={handlePublish}
                disabled={isPublishing}
              >
                <Upload size={18} aria-hidden="true" />
                <span>{isPublishing ? 'Publishing Activity...' : 'Publish Activity Now'}</span>
              </button>

              {draftId && (
                <Link to={`/activities/${draftId}`} className="btn btn-outline btn-lg">
                  <span>View Activity Page</span>
                  <ArrowRight size={16} aria-hidden="true" />
                </Link>
              )}

              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => setCreationStep('form')}
              >
                <span>Edit Details</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // 4. Step 6 Distinct State: Published Confirmation
  if (creationStep === 'published' && draftActivity) {
    const activityId = draftActivity.id || draftActivity._id;

    return (
      <div className="create-activity-root">
        <div className="create-activity-container">
          <div className="creation-success-card" role="region" aria-label="Activity Published Confirmation">
            <div className="creation-success-icon" aria-hidden="true">
              <CheckCircle2 size={36} />
            </div>

            <div className="badge badge-sage" style={{ margin: '0 auto var(--space-2)', display: 'inline-flex' }}>
              Status: Published
            </div>

            <h1 className="create-title" style={{ marginBottom: 'var(--space-2)' }}>
              Activity Published Successfully!
            </h1>

            <p className="create-subtitle" style={{ maxWidth: '480px', margin: '0 auto var(--space-6)' }}>
              Your meetup <strong>"{formData.title}"</strong> is now live and discoverable by members in your area.
            </p>

            <div style={{ display: 'flex', justifyContent: 'center', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
              {activityId && (
                <Link to={`/activities/${activityId}`} className="btn btn-primary btn-lg">
                  <span>View Published Activity</span>
                  <ArrowRight size={16} aria-hidden="true" />
                </Link>
              )}

              <Link to="/" className="btn btn-outline btn-lg">
                <span>Back to Discovery</span>
              </Link>

              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => {
                  setCreationStep('form');
                  setDraftActivity(null);
                  setCoords(null);
                  setCoordStatus('idle');
                  setFormData({
                    title: '',
                    category: 'Outdoor & Sports',
                    description: '',
                    date: '',
                    time: '',
                    duration: '1.5 hours',
                    displayArea: '',
                    budgetType: 'free',
                    costDetails: '',
                    capacity: 6,
                    skillLevel: 'All skill levels welcome',
                    approvalRequired: true,
                    rules: '',
                  });
                }}
              >
                <span>Host Another Activity</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // 5. Main Form State
  return (
    <div className="create-activity-root">
      <div className="create-activity-container">
        {/* Navigation Breadcrumb */}
        <Link to="/" className="back-link" style={{ marginBottom: 'var(--space-4)' }}>
          <ArrowLeft size={16} aria-hidden="true" />
          <span>Back to Discovery</span>
        </Link>

        <div className="create-activity-card">
          {/* Header */}
          <header className="create-header">
            <div className="create-pill">
              <Sparkles size={13} aria-hidden="true" />
              <span>Organizer Flow · Draft & Publish</span>
            </div>
            <h1 className="create-title">Create a New Meetup</h1>
            <p className="create-subtitle">
              Plan an activity within your campus or neighborhood. Fill in key details to save a draft,
              then publish when you're ready.
            </p>
          </header>

          {/* Submission / Network Feedback */}
          {submitError && (
            <div style={{ marginBottom: 'var(--space-6)' }}>
              <AlertBanner
                type={submitError.isNetworkError ? 'warning' : 'error'}
                title={submitError.isNetworkError ? 'Backend Server Unavailable' : 'Unable to Create Activity'}
                message={
                  submitError.isNetworkError
                    ? 'The LinkUp API server (http://localhost:3000) could not be reached. Your activity details remain intact in the form. Please ensure the backend is running and submit again.'
                    : submitError.message || 'An unexpected error occurred while creating your activity draft. Please check the fields and try again.'
                }
              />
            </div>
          )}

          {/* Activity Creation Form */}
          <form onSubmit={handleSubmit} noValidate>
            {/* Section 1: Basic Information */}
            <fieldset className="form-section-block">
              <legend className="form-section-heading">
                <Sparkles size={16} aria-hidden="true" />
                <span>Basic Information</span>
              </legend>

              <FormInput
                id="title"
                name="title"
                label="Activity Title"
                placeholder="e.g. Sunset Spikeball & Chill, Algorithms Study Group"
                value={formData.title}
                onChange={handleChange}
                error={errors.title}
                helperText="A clear, welcoming title that tells people what you're doing."
                required
                disabled={isSubmitting}
              />

              {/* Category Selection */}
              <div className="form-group">
                <label className="form-label" id="category-group-label">
                  Category <span className="required-star" aria-hidden="true">*</span>
                </label>
                <div className="category-select-grid" role="radiogroup" aria-labelledby="category-group-label">
                  {CATEGORIES.map((cat) => {
                    const isSelected = formData.category === cat;
                    return (
                      <button
                        key={cat}
                        type="button"
                        role="radio"
                        aria-checked={isSelected}
                        className={`category-option-btn ${isSelected ? 'selected' : ''}`}
                        onClick={() => {
                          setFormData((prev) => ({ ...prev, category: cat }));
                          if (errors.category) setErrors((prev) => ({ ...prev, category: undefined }));
                        }}
                        disabled={isSubmitting}
                      >
                        {cat}
                      </button>
                    );
                  })}
                </div>
                {errors.category && (
                  <p className="form-error-msg" role="alert">
                    {errors.category}
                  </p>
                )}
              </div>

              {/* Description */}
              <div className="form-group">
                <label htmlFor="description" className="form-label">
                  Description <span className="required-star" aria-hidden="true">*</span>
                </label>
                <textarea
                  id="description"
                  name="description"
                  className={`input ${errors.description ? 'input-error' : ''}`}
                  rows={4}
                  placeholder="Describe the plan, what to expect, who should join, and why it will be fun..."
                  value={formData.description}
                  onChange={handleChange}
                  disabled={isSubmitting}
                  aria-invalid={!!errors.description}
                  aria-describedby={errors.description ? 'desc-error' : 'desc-helper'}
                  style={{ width: '100%', resize: 'vertical' }}
                  required
                />
                {errors.description ? (
                  <p id="desc-error" className="form-error-msg" role="alert">
                    {errors.description}
                  </p>
                ) : (
                  <p id="desc-helper" className="form-helper-text">
                    Min 20 characters. Give enough context so participants know what to prepare.
                  </p>
                )}
              </div>
            </fieldset>

            {/* Section 2: Time & Duration */}
            <fieldset className="form-section-block">
              <legend className="form-section-heading">
                <Calendar size={16} aria-hidden="true" />
                <span>Date & Schedule</span>
              </legend>

              <div className="form-row-3col">
                <FormInput
                  id="date"
                  name="date"
                  type="date"
                  label="Date"
                  value={formData.date}
                  onChange={handleChange}
                  error={errors.date}
                  required
                  disabled={isSubmitting}
                />

                <FormInput
                  id="time"
                  name="time"
                  type="time"
                  label="Start Time"
                  value={formData.time}
                  onChange={handleChange}
                  error={errors.time}
                  required
                  disabled={isSubmitting}
                />

                <div className="form-group">
                  <label htmlFor="duration" className="form-label">
                    Estimated Duration <span className="required-star" aria-hidden="true">*</span>
                  </label>
                  <select
                    id="duration"
                    name="duration"
                    className="input"
                    value={formData.duration}
                    onChange={handleChange}
                    disabled={isSubmitting}
                    style={{ width: '100%' }}
                  >
                    {DURATIONS.map((dur) => (
                      <option key={dur} value={dur}>
                        {dur}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </fieldset>

            {/* Section 3: Privacy-Preserving Location & Coordinates Requirement */}
            <fieldset className="form-section-block">
              <legend className="form-section-heading">
                <MapPin size={16} aria-hidden="true" />
                <span>Location & Coordinates</span>
              </legend>

              <div className="location-privacy-tip" role="note">
                <Lock size={16} aria-hidden="true" />
                <div>
                  <strong>Location Safety Notice:</strong> Enter a recognizable public park, campus quad,
                  or general neighborhood landmark. <em>Exact coordinates are stored by the backend for radius discovery and remain hidden from non-organizers</em>.
                </div>
              </div>

              <FormInput
                id="displayArea"
                name="displayArea"
                label="General Meeting Area / Landmark (Public)"
                placeholder="e.g. Mission Dolores Park - North Lawn, Student Union 2nd Floor"
                value={formData.displayArea}
                onChange={handleChange}
                error={errors.displayArea}
                helperText="Public landmark shown to attendees for privacy."
                required
                disabled={isSubmitting}
              />

              {/* Coordinates Acquisition (Required by backend GeoJSON format) */}
              <div className="form-group" style={{ marginTop: 'var(--space-4)' }}>
                <label className="form-label">
                  Location Coordinates [longitude, latitude] <span className="required-star" aria-hidden="true">*</span>
                </label>

                <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center', flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    className={`btn ${coordStatus === 'acquired' ? 'btn-secondary' : 'btn-outline'} btn-sm`}
                    onClick={handleAcquireLocation}
                    disabled={isSubmitting || coordStatus === 'locating'}
                  >
                    <Navigation size={14} aria-hidden="true" />
                    <span>
                      {coordStatus === 'locating'
                        ? 'Acquiring GPS...'
                        : coordStatus === 'acquired'
                        ? '✓ Coordinates Acquired'
                        : 'Use My Current Location Coordinates'}
                    </span>
                  </button>

                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => setShowManualCoords(!showManualCoords)}
                  >
                    <span>{showManualCoords ? 'Hide Manual Coordinates' : 'Enter Coordinates Manually'}</span>
                  </button>
                </div>

                {coordStatus === 'acquired' && coords && (
                  <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-forest-green)', fontWeight: 600, marginTop: 'var(--space-2)' }}>
                    ✓ Coordinates set: Latitude {coords.lat}, Longitude {coords.lng} (GeoJSON order: [{coords.lng}, {coords.lat}])
                  </p>
                )}

                {coordError && (
                  <p className="form-error-msg" role="alert" style={{ marginTop: 'var(--space-2)' }}>
                    {coordError}
                  </p>
                )}

                {errors.coords && (
                  <p className="form-error-msg" role="alert" style={{ marginTop: 'var(--space-2)' }}>
                    {errors.coords}
                  </p>
                )}

                {showManualCoords && (
                  <div style={{ marginTop: 'var(--space-3)', padding: 'var(--space-3)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', backgroundColor: 'var(--bg-surface-subtle)' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' }}>
                      <div>
                        <label htmlFor="manualLat" style={{ fontSize: 'var(--font-size-xs)', fontWeight: 600, display: 'block', marginBottom: '4px' }}>
                          Latitude (-90 to 90)
                        </label>
                        <input
                          id="manualLat"
                          type="number"
                          step="any"
                          className="input"
                          placeholder="e.g. 37.7749"
                          value={manualCoords.lat}
                          onChange={(e) => setManualCoords((prev) => ({ ...prev, lat: e.target.value }))}
                          disabled={isSubmitting}
                          style={{ width: '100%' }}
                        />
                      </div>
                      <div>
                        <label htmlFor="manualLng" style={{ fontSize: 'var(--font-size-xs)', fontWeight: 600, display: 'block', marginBottom: '4px' }}>
                          Longitude (-180 to 180)
                        </label>
                        <input
                          id="manualLng"
                          type="number"
                          step="any"
                          className="input"
                          placeholder="e.g. -122.4194"
                          value={manualCoords.lng}
                          onChange={(e) => setManualCoords((prev) => ({ ...prev, lng: e.target.value }))}
                          disabled={isSubmitting}
                          style={{ width: '100%' }}
                        />
                      </div>
                    </div>
                    <button
                      type="button"
                      className="btn btn-outline btn-sm"
                      style={{ marginTop: 'var(--space-2)' }}
                      onClick={handleApplyManualCoords}
                      disabled={isSubmitting || !manualCoords.lat || !manualCoords.lng}
                    >
                      Apply Coordinates
                    </button>
                  </div>
                )}
              </div>
            </fieldset>

            {/* Section 4: Budget & Capacity */}
            <fieldset className="form-section-block">
              <legend className="form-section-heading">
                <Users size={16} aria-hidden="true" />
                <span>Capacity, Budget & Skill</span>
              </legend>

              <div className="form-row-2col">
                <FormInput
                  id="capacity"
                  name="capacity"
                  type="number"
                  label="Maximum Capacity"
                  value={formData.capacity}
                  onChange={handleChange}
                  error={errors.capacity}
                  helperText="Total participants allowed (between 2 and 100)."
                  min={2}
                  max={100}
                  required
                  disabled={isSubmitting}
                />

                <div className="form-group">
                  <label htmlFor="skillLevel" className="form-label">
                    Skill Level / Experience
                  </label>
                  <select
                    id="skillLevel"
                    name="skillLevel"
                    className="input"
                    value={formData.skillLevel}
                    onChange={handleChange}
                    disabled={isSubmitting}
                    style={{ width: '100%' }}
                  >
                    {SKILL_LEVELS.map((level) => (
                      <option key={level} value={level}>
                        {level}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="form-row-2col">
                <div className="form-group">
                  <label htmlFor="budgetType" className="form-label">
                    Cost / Budget Type <span className="required-star" aria-hidden="true">*</span>
                  </label>
                  <select
                    id="budgetType"
                    name="budgetType"
                    className="input"
                    value={formData.budgetType}
                    onChange={handleChange}
                    disabled={isSubmitting}
                    style={{ width: '100%' }}
                  >
                    <option value="free">Free (No cost to participants)</option>
                    <option value="paid">Paid or Shared Expense</option>
                  </select>
                </div>

                {formData.budgetType === 'paid' && (
                  <FormInput
                    id="costDetails"
                    name="costDetails"
                    label="Cost Details"
                    placeholder="e.g. $5 per person (court split)"
                    value={formData.costDetails}
                    onChange={handleChange}
                    error={errors.costDetails}
                    helperText="Explain what the cost covers."
                    required
                    disabled={isSubmitting}
                  />
                )}
              </div>
            </fieldset>

            {/* Section 5: Participation Rules & Expectations */}
            <fieldset className="form-section-block">
              <legend className="form-section-heading">
                <ShieldCheck size={16} aria-hidden="true" />
                <span>Approval Rules & Guidelines</span>
              </legend>

              {/* Approval Checkbox */}
              <label className="toggle-checkbox-label">
                <input
                  type="checkbox"
                  name="approvalRequired"
                  checked={formData.approvalRequired}
                  onChange={handleChange}
                  disabled={isSubmitting}
                  className="form-checkbox"
                  style={{ marginTop: '3px' }}
                />
                <div className="toggle-checkbox-text">
                  <span className="toggle-checkbox-title">Require Organizer Approval (Recommended)</span>
                  <span className="toggle-checkbox-desc">
                    When enabled, join requests stay in a pending state until you review the applicant's profile and accept them.
                  </span>
                </div>
              </label>

              {/* Rules / What to bring */}
              <div className="form-group" style={{ marginTop: 'var(--space-2)' }}>
                <label htmlFor="rules" className="form-label">
                  What to Bring & Guidelines (Optional)
                </label>
                <textarea
                  id="rules"
                  name="rules"
                  className="input"
                  rows={3}
                  placeholder="e.g.&#10;Bring a refillable water bottle&#10;Wear running sneakers&#10;Arrive 5 minutes before scheduled start"
                  value={formData.rules}
                  onChange={handleChange}
                  disabled={isSubmitting}
                  style={{ width: '100%', resize: 'vertical' }}
                />
                <p className="form-helper-text">
                  Add one tip or guideline per line.
                </p>
              </div>
            </fieldset>

            {/* Actions Bar */}
            <div className="create-actions-bar">
              <Link to="/" className="btn btn-ghost" disabled={isSubmitting}>
                Cancel
              </Link>

              <button
                type="submit"
                className="btn btn-primary btn-lg"
                disabled={isSubmitting}
              >
                {isSubmitting ? (
                  <span>Saving Draft Activity...</span>
                ) : (
                  <>
                    <PlusCircle size={18} aria-hidden="true" />
                    <span>Save Draft Activity</span>
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
