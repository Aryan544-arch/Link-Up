import React, { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { 
  fetchActivityById, 
  requestToJoinActivity, 
  cancelJoinRequest,
  fetchActivityRequests,
  decideJoinRequest 
} from '../../lib/activityApi';
import { normalizeApiError } from '../../lib/api';
import AlertBanner from '../../components/common/AlertBanner';
import { formatDisplayArea } from '../../lib/locationUtils';
import {
  ArrowLeft,
  Calendar,
  Clock,
  MapPin,
  DollarSign,
  Users,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  Lock,
  Flag,
  Compass,
  ArrowRight,
  Send,
  XCircle,
  Check,
  X,
  RefreshCw
} from 'lucide-react';

/**
 * Format timestamp into friendly date/time representation
 */
function formatActivityDateTime(startsAt) {
  if (!startsAt) return 'Time TBA';
  try {
    const date = new Date(startsAt);
    if (isNaN(date.getTime())) return String(startsAt);

    return date.toLocaleDateString(undefined, {
      weekday: 'long',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return String(startsAt);
  }
}

/**
 * Maps category to appropriate design system badge class
 */
function getCategoryBadgeClass(category) {
  const cat = String(category || '').toLowerCase();
  if (cat.includes('outdoor') || cat.includes('sport')) return 'badge-sage';
  if (cat.includes('study') || cat.includes('focus')) return 'badge-yellow';
  if (cat.includes('fitness')) return 'badge-forest';
  return 'badge-forest';
}

export default function ActivityDetailsPage() {
  const { id } = useParams();
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();

  // Activity Data States
  const [activity, setActivity] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  // Participation States
  const [joinStatus, setJoinStatus] = useState('idle'); // 'idle' | 'submitting' | 'pending' | 'approved' | 'rejected' | 'cancelled'
  const [userJoinRequestId, setUserJoinRequestId] = useState(null);
  const [joinNote, setJoinNote] = useState('');
  const [joinError, setJoinError] = useState(null);
  const [joinSuccess, setJoinSuccess] = useState(null);
  const [isCancelling, setIsCancelling] = useState(false);
  const [cancelError, setCancelError] = useState(null);

  // Organizer Management States
  const [requests, setRequests] = useState([]);
  const [isLoadingRequests, setIsLoadingRequests] = useState(false);
  const [requestsError, setRequestsError] = useState(null);
  const [decisionLoadingId, setDecisionLoadingId] = useState(null);

  // Fetch Activity Details
  const loadActivity = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    const abortController = new AbortController();

    try {
      const data = await fetchActivityById(id, { signal: abortController.signal });
      setActivity(data);

      // Check if user has an existing participation status returned by backend
      if (data.userParticipationStatus) {
        setJoinStatus(data.userParticipationStatus);
      }
      if (data.userJoinRequestId || data.userJoinRequest?.id || data.userJoinRequest?._id) {
        setUserJoinRequestId(data.userJoinRequestId || data.userJoinRequest?.id || data.userJoinRequest?._id);
      }
    } catch (err) {
      if (err.name === 'CanceledError' || err.name === 'AbortError') return;
      const normalized = err.normalized || normalizeApiError(err);
      setError(normalized);
    } finally {
      setIsLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadActivity();
  }, [loadActivity]);

  // Check if current user is the organizer
  const organizerId = activity?.organizerId || activity?.organizer?._id || activity?.organizer?.id;
  const isOrganizer = Boolean(
    user && (
      (organizerId && (user.id === organizerId || user._id === organizerId)) ||
      (typeof activity?.isOrganizer === 'boolean' && activity.isOrganizer)
    )
  );

  // Organizer: Fetch Join Requests
  const loadOrganizerRequests = useCallback(async () => {
    if (!id || !isOrganizer) return;
    setIsLoadingRequests(true);
    setRequestsError(null);

    try {
      const reqList = await fetchActivityRequests(id);
      setRequests(reqList);
    } catch (err) {
      const normalized = err.normalized || normalizeApiError(err);
      setRequestsError(normalized);
    } finally {
      setIsLoadingRequests(false);
    }
  }, [id, isOrganizer]);

  useEffect(() => {
    if (isOrganizer) {
      loadOrganizerRequests();
    }
  }, [isOrganizer, loadOrganizerRequests]);

  // Handle Request to Join Submission
  const handleRequestJoin = async (e) => {
    e.preventDefault();
    if (!isAuthenticated || joinStatus === 'submitting') return;

    setJoinStatus('submitting');
    setJoinError(null);
    setJoinSuccess(null);

    try {
      const response = await requestToJoinActivity(id, {
        note: joinNote.trim() || undefined,
      });

      const serverStatus = response?.status || response?.joinRequest?.status || 'pending';
      const createdReqId = response?.id || response?._id || response?.joinRequest?.id || response?.joinRequest?._id;
      if (createdReqId) {
        setUserJoinRequestId(createdReqId);
      }
      setJoinStatus(serverStatus === 'approved' ? 'approved' : 'pending');
      setJoinSuccess(
        serverStatus === 'approved'
          ? 'You have joined this activity!'
          : 'Your join request was submitted successfully and is pending organizer review.'
      );
      loadActivity();
    } catch (err) {
      const normalized = err.normalized || normalizeApiError(err);
      if (err.response?.status === 409 || normalized?.code === 'DUPLICATE_JOIN_REQUEST') {
        setJoinStatus('pending');
        setJoinSuccess('You have already submitted a request for this activity. It is currently pending review.');
        setJoinError(null);
      } else {
        setJoinError(normalized);
        setJoinStatus('idle');
      }
    }
  };

  // Handle Cancel Join Request (POST /api/join-requests/:id/cancel)
  const handleCancelJoin = async () => {
    const targetRequestId = userJoinRequestId;
    if (!targetRequestId || isCancelling) return;

    setIsCancelling(true);
    setCancelError(null);

    try {
      await cancelJoinRequest(targetRequestId);
      setJoinStatus('cancelled');
    } catch (err) {
      const normalized = err.normalized || normalizeApiError(err);
      setCancelError(normalized);
    } finally {
      setIsCancelling(false);
    }
  };

  // Organizer: Approve or Reject a Request (PATCH /api/join-requests/:id)
  const handleDecideRequest = async (requestId, decision) => {
    if (!requestId || decisionLoadingId) return;

    setDecisionLoadingId(requestId);

    try {
      await decideJoinRequest(requestId, decision);
      setRequests((prev) =>
        prev.map((r) =>
          (r.id === requestId || r._id === requestId) ? { ...r, status: decision } : r
        )
      );
      // Refresh activity details to reflect updated placesFilled
      loadActivity();
    } catch (err) {
      const normalized = err.normalized || normalizeApiError(err);
      alert(normalized.message || `Failed to ${decision} request.`);
    } finally {
      setDecisionLoadingId(null);
    }
  };

  // Loading Skeleton State
  if (isLoading) {
    return (
      <div className="activity-details-root">
        <div className="activity-details-container" aria-busy="true" aria-label="Loading activity details">
          <div className="skeleton-bar" style={{ width: '140px', height: '20px', marginBottom: '24px' }} />
          <div className="activity-details-layout">
            <div className="activity-main-column">
              <div className="activity-skeleton-header">
                <div className="skeleton-bar" style={{ width: '120px', height: '24px' }} />
                <div className="skeleton-bar" style={{ width: '85%', height: '36px' }} />
                <div className="skeleton-bar" style={{ width: '50%', height: '20px' }} />
              </div>
              <div className="activity-meta-grid">
                {[1, 2, 3, 4].map((n) => (
                  <div key={n} className="skeleton-card" style={{ minHeight: '80px', borderRadius: 'var(--radius-lg)' }} />
                ))}
              </div>
              <div className="skeleton-card" style={{ minHeight: '160px', borderRadius: 'var(--radius-xl)' }} />
            </div>
            <div className="activity-sidebar">
              <div className="activity-skeleton-sidebar" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Error States (404 Not Found vs Server Unavailable)
  if (error || !activity) {
    const isNotFound = error?.status === 404 || error?.isNotFound;

    return (
      <div className="activity-details-root">
        <div className="activity-details-container">
          <Link to="/" className="back-link">
            <ArrowLeft size={16} aria-hidden="true" />
            <span>Back to Discovery Feed</span>
          </Link>

          {isNotFound ? (
            <div className="empty-discovery-card" role="status" aria-label="Activity not found">
              <div className="empty-icon-bubble">
                <Compass size={32} aria-hidden="true" />
              </div>
              <h2 className="empty-title">Activity Not Found</h2>
              <p className="empty-desc">
                The activity you are looking for may have been completed, cancelled by the organizer,
                or does not exist.
              </p>
              <div className="empty-actions-row">
                <Link to="/" className="btn btn-primary">
                  <span>Explore Other Activities</span>
                  <ArrowRight size={16} aria-hidden="true" />
                </Link>
              </div>
            </div>
          ) : (
            <div style={{ maxWidth: '640px', margin: 'var(--space-8) auto' }}>
              <AlertBanner
                type="error"
                title={error?.isNetworkError ? "Backend Server Unavailable" : "Failed to Load Activity"}
                message={
                  error?.isNetworkError
                    ? "The LinkUp REST API (http://localhost:3000) could not be reached. Ensure the backend server is running and try again."
                    : error?.message || "An unexpected error occurred while loading this activity."
                }
                onRetry={loadActivity}
                retryLabel="Retry Connection"
              />
            </div>
          )}
        </div>
      </div>
    );
  }

  // Destructure verified activity fields
  const {
    _id,
    title = 'Untitled Activity',
    category = 'General',
    description = 'No additional description provided by the organizer.',
    displayArea,
    area,
    startsAt,
    endsAt,
    duration,
    budget,
    cost,
    capacity,
    spotsRemaining,
    placesRemaining,
    participantsCount,
    placesFilled,
    approvalRequired = true,
    organizer,
    organizerName,
    status = 'published',
    skillLevel = 'All skill levels welcome',
    rules = [],
  } = activity;

  const activityId = activity.id || _id || id;
  const organizerDisplay = organizer?.displayName || organizerName || 'LinkUp Organizer';
  const displayBudget = budget || cost || 'Free';
  // Location Privacy: Always display human-readable displayArea or general area name
  const generalLocation = formatDisplayArea(displayArea || area, activity.location?.coordinates);
  const badgeClass = getCategoryBadgeClass(category);

  // Compute spots information defensively
  const maxCapacity = typeof capacity === 'number' ? capacity : null;
  const currentParticipants = typeof placesFilled === 'number' ? placesFilled : (typeof participantsCount === 'number' ? participantsCount : 0);
  const remainingSpots = typeof placesRemaining === 'number'
    ? placesRemaining
    : typeof spotsRemaining === 'number'
    ? spotsRemaining
    : maxCapacity !== null
    ? Math.max(0, maxCapacity - currentParticipants)
    : null;

  const isFull = typeof activity.isFull === 'boolean'
    ? activity.isFull
    : maxCapacity !== null && remainingSpots !== null && remainingSpots <= 0;
  const isCancelled = status === 'cancelled';

  return (
    <div className="activity-details-root">
      <div className="activity-details-container">
        {/* Navigation Breadcrumb */}
        <Link to="/" className="back-link">
          <ArrowLeft size={16} aria-hidden="true" />
          <span>Back to Discovery Feed</span>
        </Link>

        <div className="activity-details-layout">
          {/* Main Column */}
          <div className="activity-main-column" role="region" aria-label="Activity Main Information">
            {/* Header Card */}
            <header className="activity-header-card">
              <div className="activity-header-badges">
                <span className={`badge ${badgeClass}`}>{category}</span>
                {isCancelled && (
                  <span className="badge" style={{ backgroundColor: '#fee2e2', color: '#991b1b' }}>
                    Cancelled
                  </span>
                )}
                {isFull && !isCancelled && (
                  <span className="badge" style={{ backgroundColor: '#fef3c7', color: '#92400e' }}>
                    At Capacity
                  </span>
                )}
                <span className="badge badge-sage">
                  {approvalRequired ? 'Approval Required' : 'Instant Join'}
                </span>
              </div>

              <h1 className="activity-main-title">{title}</h1>

              {/* Organizer Row */}
              <div className="activity-organizer-row">
                <div className="organizer-avatar" aria-hidden="true">
                  {organizerDisplay.charAt(0).toUpperCase()}
                </div>
                <div className="organizer-info">
                  <span className="organizer-label">Organizer</span>
                  <span className="organizer-name">{organizerDisplay}</span>
                </div>
              </div>
            </header>

            {/* Quick Details Meta Grid */}
            <div className="activity-meta-grid" role="region" aria-label="Key Meetup Details">
              {/* Date & Time */}
              <div className="meta-info-card">
                <div className="meta-icon-box" aria-hidden="true">
                  <Calendar size={18} />
                </div>
                <div>
                  <div className="meta-label">Date & Time</div>
                  <div className="meta-value">{formatActivityDateTime(startsAt)}</div>
                  {(duration || endsAt) && (
                    <div className="meta-subtext">
                      {duration ? `Duration: ${duration}` : `Ends around ${formatActivityDateTime(endsAt)}`}
                    </div>
                  )}
                </div>
              </div>

              {/* General Display Area (Location Privacy: Never exposes coordinates) */}
              <div className="meta-info-card">
                <div className="meta-icon-box" aria-hidden="true">
                  <MapPin size={18} />
                </div>
                <div>
                  <div className="meta-label">Location Area</div>
                  <div className="meta-value">{generalLocation}</div>
                  <div className="meta-subtext">Approximate meeting area</div>
                </div>
              </div>

              {/* Budget / Cost */}
              <div className="meta-info-card">
                <div className="meta-icon-box" aria-hidden="true">
                  <DollarSign size={18} />
                </div>
                <div>
                  <div className="meta-label">Budget / Cost</div>
                  <div className="meta-value">{displayBudget}</div>
                  <div className="meta-subtext">No hidden fees</div>
                </div>
              </div>

              {/* Skill / Compatibility */}
              <div className="meta-info-card">
                <div className="meta-icon-box" aria-hidden="true">
                  <Sparkles size={18} />
                </div>
                <div>
                  <div className="meta-label">Skill & Pace</div>
                  <div className="meta-value">{skillLevel}</div>
                  <div className="meta-subtext">Beginners & regulars welcome</div>
                </div>
              </div>
            </div>

            {/* Location Privacy Advisory */}
            <div className="privacy-notice-box" role="note" aria-label="Location Privacy Advisory">
              <Lock size={18} className="privacy-notice-icon" aria-hidden="true" />
              <div className="privacy-notice-text">
                <div className="privacy-notice-title">Privacy by Design</div>
                For member safety and location privacy, exact coordinates are visible only to the organizer.
                Non-organizers, including attendees, see the general display area ({generalLocation}).
              </div>
            </div>

            {/* Description Section */}
            <section className="activity-section-card" aria-labelledby="descHeading">
              <h2 id="descHeading" className="section-card-title">
                About this Activity
              </h2>
              <div className="section-card-body">
                {description.split('\n\n').map((paragraph, idx) => (
                  <p key={idx}>{paragraph}</p>
                ))}
              </div>
            </section>

            {/* Guidelines & Expectations */}
            <section className="activity-section-card" aria-labelledby="rulesHeading">
              <h2 id="rulesHeading" className="section-card-title">
                Participation Guidelines
              </h2>
              <div className="section-card-body">
                <p>
                  To keep LinkUp activities safe, friendly, and reliable for everyone:
                </p>
                <ul className="rules-list">
                  <li className="rule-item">
                    <CheckCircle2 size={16} className="rule-check-icon" aria-hidden="true" />
                    <span>Please arrive 5–10 minutes early at the agreed public meeting area.</span>
                  </li>
                  <li className="rule-item">
                    <CheckCircle2 size={16} className="rule-check-icon" aria-hidden="true" />
                    <span>Bring any personal gear or water needed for the activity.</span>
                  </li>
                  <li className="rule-item">
                    <CheckCircle2 size={16} className="rule-check-icon" aria-hidden="true" />
                    <span>If your plans change, please withdraw your request early so someone else can join.</span>
                  </li>
                  {Array.isArray(rules) && rules.map((customRule, index) => (
                    <li key={index} className="rule-item">
                      <CheckCircle2 size={16} className="rule-check-icon" aria-hidden="true" />
                      <span>{customRule}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </section>

            {/* Organizer Management Dashboard (Step 7: Organizer only) */}
            {isOrganizer && (
              <section className="activity-section-card" aria-labelledby="organizerHeading">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-3)' }}>
                  <h2 id="organizerHeading" className="section-card-title" style={{ margin: 0 }}>
                    Manage Join Requests ({requests.length})
                  </h2>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={loadOrganizerRequests}
                    disabled={isLoadingRequests}
                    title="Refresh requests list"
                  >
                    <RefreshCw size={14} aria-hidden="true" />
                    <span>Refresh</span>
                  </button>
                </div>

                {requestsError && (
                  <AlertBanner
                    type="error"
                    title="Could not load requests"
                    message={requestsError.message}
                  />
                )}

                {isLoadingRequests && requests.length === 0 ? (
                  <p style={{ color: 'var(--text-muted)', fontSize: 'var(--font-size-sm)' }}>
                    Loading participant requests...
                  </p>
                ) : requests.length === 0 ? (
                  <p style={{ color: 'var(--text-muted)', fontSize: 'var(--font-size-sm)' }}>
                    No join requests have been submitted for this activity yet.
                  </p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                    {requests.map((req) => {
                      const reqId = req.id || req._id;
                      const requesterName =
                        req.userId?.displayName ||
                        req.user?.displayName ||
                        req.requester?.displayName ||
                        req.userName ||
                        req.displayName ||
                        'Participant';
                      const isPending = req.status === 'pending';
                      const isDeciding = decisionLoadingId === reqId;

                      return (
                        <div
                          key={reqId}
                          style={{
                            padding: 'var(--space-4)',
                            borderRadius: 'var(--radius-lg)',
                            border: '1px solid var(--border-color)',
                            backgroundColor: 'var(--bg-surface-subtle)',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            flexWrap: 'wrap',
                            gap: 'var(--space-3)'
                          }}
                        >
                          <div>
                            <div style={{ fontWeight: 700, fontSize: 'var(--font-size-sm)' }}>
                              {requesterName}
                            </div>
                            {req.note && (
                              <p style={{ margin: '4px 0', fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)' }}>
                                "{req.note}"
                              </p>
                            )}
                            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginTop: '4px' }}>
                              <span
                                className="badge"
                                style={{
                                  fontSize: '11px',
                                  textTransform: 'capitalize',
                                  backgroundColor: req.status === 'approved' ? '#dcfce7' : req.status === 'rejected' ? '#fee2e2' : '#fef3c7',
                                  color: req.status === 'approved' ? '#166534' : req.status === 'rejected' ? '#991b1b' : '#92400e'
                                }}
                              >
                                Status: {req.status}
                              </span>
                              {req.createdAt && (
                                <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                                  Submitted {formatActivityDateTime(req.createdAt)}
                                </span>
                              )}
                            </div>
                          </div>

                          {isPending && (
                            <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                              <button
                                type="button"
                                className="btn btn-primary btn-sm"
                                onClick={() => handleDecideRequest(reqId, 'approved')}
                                disabled={isDeciding}
                              >
                                <Check size={14} aria-hidden="true" />
                                <span>Approve</span>
                              </button>
                              <button
                                type="button"
                                className="btn btn-outline btn-sm"
                                onClick={() => handleDecideRequest(reqId, 'rejected')}
                                disabled={isDeciding}
                              >
                                <X size={14} aria-hidden="true" />
                                <span>Reject</span>
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>
            )}
          </div>

          {/* Sticky Participation Sidebar (Right Rail) */}
          <aside className="activity-sidebar" aria-label="Participation and Action Card">
            <div className="participation-card">
              <div className="participation-card-header">
                <div className="price-display">
                  <span className="price-label">Cost</span>
                  <span className="price-value">{displayBudget}</span>
                </div>
                <span className="badge badge-forest">
                  {approvalRequired ? 'Review Required' : 'Open'}
                </span>
              </div>

              {/* Capacity Progress Tracker */}
              {maxCapacity !== null && (
                <div className="capacity-tracker-wrap">
                  <div className="capacity-tracker-header">
                    <span style={{ color: 'var(--text-muted)' }}>Group Capacity</span>
                    <span className="capacity-count-text">
                      {remainingSpots !== null
                        ? `${remainingSpots} spots remaining`
                        : `${maxCapacity} max capacity`}
                    </span>
                  </div>
                  <div className="capacity-track" role="progressbar" aria-valuenow={currentParticipants} aria-valuemin="0" aria-valuemax={maxCapacity}>
                    <div
                      className={`capacity-fill ${remainingSpots !== null && remainingSpots <= 2 ? 'high' : ''}`}
                      style={{
                        width: `${Math.min(100, Math.max(10, (currentParticipants / maxCapacity) * 100))}%`,
                      }}
                    />
                  </div>
                </div>
              )}

              {/* Status & Error Feedback */}
              {joinSuccess && (
                <AlertBanner
                  type="success"
                  title="Request Update"
                  message={joinSuccess}
                />
              )}

              {joinError && (
                <AlertBanner
                  type="error"
                  title="Request Failed"
                  message={
                    joinError.isNetworkError
                      ? "Unable to reach the server. Please check your network connection."
                      : joinError.message || "Could not submit join request. Please try again."
                  }
                />
              )}

              {cancelError && (
                <AlertBanner
                  type="error"
                  title="Cancellation Failed"
                  message={cancelError.message || "Could not cancel join request."}
                />
              )}

              {/* Join / Status Interactions */}
              {isCancelled ? (
                <div className="participation-status-box pending" style={{ backgroundColor: '#fee2e2', borderColor: '#fca5a5' }}>
                  <div className="participation-status-title" style={{ color: '#991b1b' }}>
                    <AlertCircle size={16} aria-hidden="true" />
                    <span>Activity Cancelled</span>
                  </div>
                  <p className="participation-status-desc">
                    This meetup was cancelled by the organizer and is not accepting requests.
                  </p>
                </div>
              ) : isOrganizer ? (
                <div className="participation-status-box approved">
                  <div className="participation-status-title">
                    <CheckCircle2 size={16} aria-hidden="true" />
                    <span>You are the Organizer</span>
                  </div>
                  <p className="participation-status-desc">
                    You created this activity. Review attendee requests in the management panel below.
                  </p>
                </div>
              ) : joinStatus === 'approved' ? (
                <div className="participation-status-box approved">
                  <div className="participation-status-title">
                    <CheckCircle2 size={16} aria-hidden="true" />
                    <span>Participation Confirmed</span>
                  </div>
                  <p className="participation-status-desc">
                    Your request was accepted by {organizerDisplay}.
                  </p>
                  {userJoinRequestId && (
                    <button
                      type="button"
                      className="btn btn-outline btn-sm btn-full"
                      style={{ marginTop: 'var(--space-3)' }}
                      onClick={handleCancelJoin}
                      disabled={isCancelling}
                    >
                      <XCircle size={14} aria-hidden="true" />
                      <span>{isCancelling ? 'Cancelling...' : 'Cancel Participation'}</span>
                    </button>
                  )}
                </div>
              ) : joinStatus === 'pending' ? (
                <div className="participation-status-box pending">
                  <div className="participation-status-title">
                    <Clock size={16} aria-hidden="true" />
                    <span>Request Pending Review</span>
                  </div>
                  <p className="participation-status-desc">
                    Your request has been sent to {organizerDisplay}.
                  </p>
                  {userJoinRequestId && (
                    <button
                      type="button"
                      className="btn btn-outline btn-sm btn-full"
                      style={{ marginTop: 'var(--space-3)' }}
                      onClick={handleCancelJoin}
                      disabled={isCancelling}
                    >
                      <XCircle size={14} aria-hidden="true" />
                      <span>{isCancelling ? 'Cancelling...' : 'Cancel Join Request'}</span>
                    </button>
                  )}
                </div>
              ) : joinStatus === 'cancelled' ? (
                <div className="participation-status-box" style={{ backgroundColor: 'var(--bg-surface-subtle)', border: '1px solid var(--border-color)' }}>
                  <div className="participation-status-title" style={{ color: 'var(--text-secondary)' }}>
                    <XCircle size={16} aria-hidden="true" />
                    <span>Request Cancelled</span>
                  </div>
                  <p className="participation-status-desc">
                    Your request to join this activity was cancelled.
                  </p>
                  <button
                    type="button"
                    className="btn btn-outline btn-sm btn-full"
                    style={{ marginTop: 'var(--space-2)' }}
                    onClick={() => setJoinStatus('idle')}
                  >
                    Request to Join Again
                  </button>
                </div>
              ) : joinStatus === 'rejected' ? (
                <div className="participation-status-box" style={{ backgroundColor: 'var(--bg-surface-subtle)', border: '1px solid var(--border-color)' }}>
                  <div className="participation-status-title" style={{ color: 'var(--text-secondary)' }}>
                    <AlertCircle size={16} aria-hidden="true" />
                    <span>Request Not Accepted</span>
                  </div>
                  <p className="participation-status-desc">
                    The organizer was unable to accept your request for this meetup.
                  </p>
                </div>
              ) : isFull ? (
                <div className="participation-action-wrap">
                  <button type="button" className="btn btn-outline btn-full" disabled>
                    Activity Full
                  </button>
                  <p className="participation-disclaimer">
                    This activity has reached its participant capacity.
                  </p>
                </div>
              ) : !isAuthenticated ? (
                <div className="participation-action-wrap">
                  <Link
                    to={`/login?redirect=/activities/${activityId}`}
                    className="btn btn-primary btn-full"
                  >
                    <span>Sign In to Request</span>
                    <ArrowRight size={16} aria-hidden="true" />
                  </Link>

                  <Link
                    to={`/signup?redirect=/activities/${activityId}`}
                    className="btn btn-outline btn-full btn-sm"
                  >
                    <span>Create a LinkUp Account</span>
                  </Link>

                  <p className="participation-disclaimer">
                    Sign in to connect with organizers and join verified campus and community meetups.
                  </p>
                </div>
              ) : (
                /* Authenticated User: Request to Join Form */
                <form onSubmit={handleRequestJoin} className="participation-action-wrap">
                  <label htmlFor="joinNote" style={{ fontSize: 'var(--font-size-xs)', fontWeight: 600, color: 'var(--text-secondary)' }}>
                    Message to Organizer (Optional):
                  </label>
                  <textarea
                    id="joinNote"
                    className="participation-note-input"
                    placeholder="Introduce yourself or share what you're excited about..."
                    value={joinNote}
                    onChange={(e) => setJoinNote(e.target.value)}
                    maxLength={300}
                    disabled={joinStatus === 'submitting'}
                  />

                  <button
                    type="submit"
                    className="btn btn-primary btn-full"
                    disabled={joinStatus === 'submitting'}
                  >
                    {joinStatus === 'submitting' ? (
                      <span>Sending Request...</span>
                    ) : (
                      <>
                        <Send size={15} aria-hidden="true" />
                        <span>Request to Join</span>
                      </>
                    )}
                  </button>

                  <p className="participation-disclaimer">
                    Requests are non-binding suggestions. The organizer reviews each request before confirming attendance.
                  </p>
                </form>
              )}
            </div>

            {/* Community Standards & Reporting Disabled Notice (Step 5) */}
            <div className="activity-safety-card">
              <div className="safety-card-title">
                <ShieldCheck size={16} className="feature-icon-forest" aria-hidden="true" />
                <span>LinkUp Community Standards</span>
              </div>
              <p className="safety-card-desc">
                Meetups are held in public spaces. Never transfer money off-platform or share private sensitive info.
              </p>
              {/* Mandatory Step 5 Demo Notice */}
              <div 
                className="reporting-disabled-notice" 
                role="status" 
                aria-label="Reporting notice"
                style={{
                  fontSize: 'var(--font-size-xs)',
                  color: 'var(--text-muted)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  paddingTop: 'var(--space-2)',
                  borderTop: '1px solid var(--border-light)'
                }}
              >
                <Flag size={13} aria-hidden="true" />
                <span>Reporting is unavailable in this demo</span>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
