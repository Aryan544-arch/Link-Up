import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import {
  fetchMyPlans,
  cancelJoinRequest,
  decideProposal,
  cancelProposal,
  cancelActivity
} from '../../lib/activityApi';
import { normalizeApiError } from '../../lib/api';
import ActivityCard from '../../components/activities/ActivityCard';
import AlertBanner from '../../components/common/AlertBanner';
import {
  Calendar,
  Compass,
  PlusCircle,
  Clock,
  CheckCircle2,
  AlertCircle,
  LogIn,
  ArrowRight,
  Info,
  RefreshCw,
  Lock,
  XCircle,
  Check,
  X,
  MapPin,
  Users,
  Tag
} from 'lucide-react';

function formatPlanDate(dateStr) {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return String(dateStr);
    return d.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return String(dateStr);
  }
}

function formatPlanTime(dateStr) {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleTimeString(undefined, {
      hour: '2-digit',
      minute: '2-digit'
    });
  } catch {
    return '';
  }
}

export default function MyPlansPage() {
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const [plansData, setPlansData] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [fetchError, setFetchError] = useState(null);
  const [actionAlert, setActionAlert] = useState(null);

  const [cancellingRequestId, setCancellingRequestId] = useState(null);
  const [decidingProposalId, setDecidingProposalId] = useState(null);
  const [cancellingProposalId, setCancellingProposalId] = useState(null);
  const [cancellingActivityId, setCancellingActivityId] = useState(null);

  // Fetch plans automatically on mount when authenticated
  const loadPlans = useCallback(async () => {
    if (!isAuthenticated) return;
    setIsLoading(true);
    setFetchError(null);

    try {
      const data = await fetchMyPlans();
      setPlansData(data);
    } catch (err) {
      const normalized = err.normalized || normalizeApiError(err);
      setFetchError(normalized);
    } finally {
      setIsLoading(false);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    if (isAuthenticated) {
      loadPlans();
    }
  }, [isAuthenticated, loadPlans]);

  // Cancel join request (for attended or pending requests)
  const handleCancelRequest = async (requestId, group) => {
    if (!requestId) return;
    setCancellingRequestId(requestId);
    setActionAlert(null);

    try {
      await cancelJoinRequest(requestId);
      setActionAlert({
        type: 'success',
        title: 'Request Cancelled',
        message: 'Your join request was successfully cancelled.',
      });
      await loadPlans();
    } catch (err) {
      const normalized = err.normalized || normalizeApiError(err);
      setActionAlert({
        type: 'error',
        title: 'Cancellation Failed',
        message: normalized.message || 'Unable to cancel join request. Please try again.',
      });
    } finally {
      setCancellingRequestId(null);
    }
  };

  // Recipient decides proposal (accept or reject)
  const handleDecideProposal = async (proposalId, decision) => {
    if (!proposalId) return;
    setDecidingProposalId(proposalId);
    setActionAlert(null);

    try {
      const result = await decideProposal(proposalId, decision);
      if (decision === 'accepted') {
        const title = result?.activity?.title || 'Draft Activity';
        setActionAlert({
          type: 'success',
          title: 'Proposal Accepted',
          message: `Proposal accepted! Draft activity "${title}" is ready and your spot is confirmed.`,
        });
      } else {
        setActionAlert({
          type: 'info',
          title: 'Proposal Rejected',
          message: 'You have rejected this proposal. Both interest requests are now active again.',
        });
      }
      await loadPlans();
    } catch (err) {
      const normalized = err.normalized || normalizeApiError(err);
      setActionAlert({
        type: 'error',
        title: decision === 'accepted' ? 'Acceptance Failed' : 'Rejection Failed',
        message: normalized.message || 'Unable to process proposal decision. Please try again.',
      });
    } finally {
      setDecidingProposalId(null);
    }
  };

  // Proposer cancels their pending proposal
  const handleCancelProposal = async (proposalId) => {
    if (!proposalId) return;
    setCancellingProposalId(proposalId);
    setActionAlert(null);

    try {
      await cancelProposal(proposalId);
      setActionAlert({
        type: 'success',
        title: 'Proposal Cancelled',
        message: 'Your proposal was cancelled and associated interest requests were unlocked.',
      });
      await loadPlans();
    } catch (err) {
      const normalized = err.normalized || normalizeApiError(err);
      setActionAlert({
        type: 'error',
        title: 'Cancellation Failed',
        message: normalized.message || 'Unable to cancel proposal. Please try again.',
      });
    } finally {
      setCancellingProposalId(null);
    }
  };

  // Organizer cancels their organized activity
  const handleCancelActivity = async (activityId) => {
    if (!activityId) return;
    setCancellingActivityId(activityId);
    setActionAlert(null);

    try {
      await cancelActivity(activityId);
      setActionAlert({
        type: 'success',
        title: 'Activity Cancelled',
        message: 'Your organized activity has been cancelled.',
      });
      await loadPlans();
    } catch (err) {
      const normalized = err.normalized || normalizeApiError(err);
      setActionAlert({
        type: 'error',
        title: 'Cancellation Failed',
        message: normalized.message || 'Unable to cancel activity. Please try again.',
      });
    } finally {
      setCancellingActivityId(null);
    }
  };

  if (authLoading) {
    return (
      <div className="container" style={{ padding: 'var(--space-12) var(--space-4)', textAlign: 'center' }}>
        <p style={{ color: 'var(--text-muted)' }}>Checking authentication...</p>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="container" style={{ padding: 'var(--space-12) var(--space-4)' }}>
        <div className="auth-gate-card" style={{ maxWidth: '520px', margin: '0 auto', textAlign: 'center', padding: 'var(--space-8)', background: 'var(--bg-surface)', borderRadius: 'var(--radius-xl)', border: '1px solid var(--border-color)' }}>
          <Calendar size={36} color="var(--color-forest-green)" style={{ margin: '0 auto var(--space-4)' }} />
          <h1 style={{ fontSize: 'var(--font-size-2xl)', fontWeight: 800, marginBottom: 'var(--space-2)' }}>
            Sign In to View My Plans
          </h1>
          <p style={{ color: 'var(--text-secondary)', marginBottom: 'var(--space-6)', fontSize: 'var(--font-size-sm)' }}>
            Track the activities you are hosting, join requests you've submitted, and upcoming meetups you are attending.
          </p>
          <div style={{ display: 'flex', gap: 'var(--space-3)', justifyContent: 'center' }}>
            <Link to="/login?redirect=/plans" className="btn btn-primary">
              <LogIn size={16} aria-hidden="true" />
              <span>Sign In</span>
            </Link>
            <Link to="/signup?redirect=/plans" className="btn btn-outline">
              <span>Create Account</span>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // Derive counts and lists safely from verified backend contract
  const organizedActs = Array.isArray(plansData?.organized) ? plansData.organized : [];
  const joinedItems = Array.isArray(plansData?.joined) ? plansData.joined : [];
  const pendingItems = Array.isArray(plansData?.pendingRequests)
    ? plansData.pendingRequests
    : (Array.isArray(plansData?.pending) ? plansData.pending : []);
  const interestItems = Array.isArray(plansData?.interestRequests) ? plansData.interestRequests : [];
  const proposalItems = Array.isArray(plansData?.proposals) ? plansData.proposals : [];

  const summary = plansData?.summary && typeof plansData.summary === 'object' ? plansData.summary : {};
  const organizedCount = typeof summary.organizedCount === 'number'
    ? summary.organizedCount
    : (typeof summary.organized === 'number' ? summary.organized : organizedActs.length);
  const joinedCount = typeof summary.joinedCount === 'number'
    ? summary.joinedCount
    : (typeof summary.joined === 'number' ? summary.joined : joinedItems.length);
  const pendingCount = typeof summary.pendingRequestsCount === 'number'
    ? summary.pendingRequestsCount
    : (typeof summary.pendingRequests === 'number' ? summary.pendingRequests : pendingItems.length);
  const interestCount = typeof summary.interestRequestsCount === 'number'
    ? summary.interestRequestsCount
    : (typeof summary.interestRequests === 'number' ? summary.interestRequests : interestItems.length);
  const proposalsCount = typeof summary.proposalsCount === 'number'
    ? summary.proposalsCount
    : (typeof summary.proposals === 'number' ? summary.proposals : proposalItems.length);

  const totalPlansCount = typeof summary.totalPlansCount === 'number'
    ? summary.totalPlansCount
    : (organizedCount + joinedCount + pendingCount + interestCount + proposalsCount);

  return (
    <div className="container" style={{ padding: 'var(--space-8) var(--space-4)' }}>
      <header style={{ marginBottom: 'var(--space-8)', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 'var(--space-4)' }}>
        <div>
          <div className="badge badge-forest" style={{ marginBottom: 'var(--space-2)', display: 'inline-flex' }}>
            Phase 7 Verified Dashboard
          </div>
          <h1 style={{ fontSize: 'var(--font-size-3xl)', fontWeight: 800, color: 'var(--color-forest-green)', marginBottom: 'var(--space-2)' }}>
            My Plans
          </h1>
          <p style={{ color: 'var(--text-secondary)' }}>
            Personal activity schedule and participation tracker.
          </p>
        </div>
        <button
          type="button"
          className="btn btn-outline btn-sm"
          onClick={loadPlans}
          disabled={isLoading}
          aria-label="Refresh plans"
        >
          <RefreshCw size={14} className={isLoading ? 'spin-icon' : ''} aria-hidden="true" />
          <span>{isLoading ? 'Refreshing...' : 'Refresh Plans'}</span>
        </button>
      </header>

      {/* Action alerts feedback */}
      {actionAlert && (
        <div style={{ marginBottom: 'var(--space-6)' }}>
          <AlertBanner
            type={actionAlert.type}
            title={actionAlert.title}
            message={actionAlert.message}
          />
        </div>
      )}

      {/* Initial loading state */}
      {isLoading && !plansData && (
        <div style={{ textAlign: 'center', padding: 'var(--space-12) var(--space-4)' }}>
          <RefreshCw size={28} className="spin-icon" style={{ color: 'var(--color-forest-green)', margin: '0 auto var(--space-3)' }} aria-hidden="true" />
          <p style={{ color: 'var(--text-secondary)' }}>Loading your plans and activities...</p>
        </div>
      )}

      {/* Fetch error state */}
      {fetchError && !plansData && (
        <div style={{ maxWidth: '640px', margin: '0 auto', textAlign: 'center', padding: 'var(--space-8)', background: 'var(--bg-surface)', borderRadius: 'var(--radius-xl)', border: '1px solid var(--border-color)' }}>
          <AlertCircle size={36} color="#dc2626" style={{ margin: '0 auto var(--space-3)' }} />
          <h2 style={{ fontSize: 'var(--font-size-xl)', fontWeight: 700, marginBottom: 'var(--space-2)' }}>
            Unable to Load Plans
          </h2>
          <p style={{ color: 'var(--text-secondary)', marginBottom: 'var(--space-6)', fontSize: 'var(--font-size-sm)' }}>
            {fetchError.message || 'The server encountered an error while retrieving your plans.'}
          </p>
          <button type="button" className="btn btn-primary" onClick={loadPlans}>
            <RefreshCw size={14} aria-hidden="true" />
            <span>Try Again</span>
          </button>
        </div>
      )}

      {/* Live plansData view */}
      {plansData && (
        <div>
          {/* Summary Metric Counters */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
              gap: 'var(--space-3)',
              marginBottom: 'var(--space-8)',
            }}
          >
            <div style={{ padding: 'var(--space-3)', background: 'var(--bg-surface)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)', textAlign: 'center' }}>
              <div style={{ fontSize: 'var(--font-size-2xl)', fontWeight: 800, color: 'var(--color-forest-green)' }}>{totalPlansCount}</div>
              <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)' }}>Total Plans</div>
            </div>
            <div style={{ padding: 'var(--space-3)', background: 'var(--bg-surface)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)', textAlign: 'center' }}>
              <div style={{ fontSize: 'var(--font-size-2xl)', fontWeight: 800 }}>{organizedCount}</div>
              <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)' }}>Organized</div>
            </div>
            <div style={{ padding: 'var(--space-3)', background: 'var(--bg-surface)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)', textAlign: 'center' }}>
              <div style={{ fontSize: 'var(--font-size-2xl)', fontWeight: 800 }}>{joinedCount}</div>
              <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)' }}>Joined</div>
            </div>
            <div style={{ padding: 'var(--space-3)', background: 'var(--bg-surface)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)', textAlign: 'center' }}>
              <div style={{ fontSize: 'var(--font-size-2xl)', fontWeight: 800 }}>{pendingCount}</div>
              <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)' }}>Pending</div>
            </div>
            <div style={{ padding: 'var(--space-3)', background: 'var(--bg-surface)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)', textAlign: 'center' }}>
              <div style={{ fontSize: 'var(--font-size-2xl)', fontWeight: 800 }}>{interestCount}</div>
              <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)' }}>Interests</div>
            </div>
            <div style={{ padding: 'var(--space-3)', background: 'var(--bg-surface)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)', textAlign: 'center' }}>
              <div style={{ fontSize: 'var(--font-size-2xl)', fontWeight: 800 }}>{proposalsCount}</div>
              <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)' }}>Proposals</div>
            </div>
          </div>

          {/* 1. Activities I Organize */}
          {organizedActs.length > 0 && (
            <section style={{ marginBottom: 'var(--space-8)' }}>
              <h2 style={{ fontSize: 'var(--font-size-xl)', fontWeight: 700, marginBottom: 'var(--space-4)' }}>
                Activities I Organize ({organizedActs.length})
              </h2>
              <div className="activity-grid">
                {organizedActs.map((act) => {
                  const key = act.id || act._id;
                  const isCancelling = cancellingActivityId === key;
                  const safeAct = {
                    ...act,
                    organizerName: user?.displayName || 'You (Host)',
                  };

                  return (
                    <div key={key} style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                      <ActivityCard activity={safeAct} />
                      {act.status !== 'cancelled' && (
                        <div
                          style={{
                            marginTop: 'var(--space-2)',
                            padding: 'var(--space-2) var(--space-3)',
                            backgroundColor: 'var(--bg-surface)',
                            borderRadius: 'var(--radius-md)',
                            border: '1px solid var(--border-color)',
                            display: 'flex',
                            justifyContent: 'flex-end',
                          }}
                        >
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            style={{ color: '#dc2626' }}
                            onClick={() => handleCancelActivity(key)}
                            disabled={isCancelling}
                            aria-label="Cancel Organized Activity"
                          >
                            <XCircle size={14} className={isCancelling ? 'spin-icon' : ''} aria-hidden="true" />
                            <span>{isCancelling ? 'Cancelling...' : 'Cancel Activity'}</span>
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* 2. Confirmed / Joined Activities */}
          {joinedItems.length > 0 && (
            <section style={{ marginBottom: 'var(--space-8)' }}>
              <h2 style={{ fontSize: 'var(--font-size-xl)', fontWeight: 700, marginBottom: 'var(--space-4)' }}>
                Confirmed Activities ({joinedItems.length})
              </h2>
              <div className="activity-grid">
                {joinedItems.map((item) => {
                  const act = item.activity || {};
                  const requestId = item.requestId;
                  const key = requestId || act.id || act._id;
                  const isCancelling = cancellingRequestId === requestId;

                  return (
                    <div key={key} style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                      <ActivityCard activity={act} />
                      <div
                        style={{
                          marginTop: 'var(--space-2)',
                          padding: 'var(--space-3)',
                          backgroundColor: 'var(--bg-surface)',
                          borderRadius: 'var(--radius-md)',
                          border: '1px solid var(--border-color)',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          gap: 'var(--space-2)',
                          flexWrap: 'wrap',
                        }}
                      >
                        <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)' }}>
                          <span className="badge badge-sage" style={{ marginRight: 'var(--space-2)' }}>
                            {item.status || 'Confirmed'}
                          </span>
                          {item.joinedAt && (
                            <span>Joined {formatPlanDate(item.joinedAt)}</span>
                          )}
                        </div>
                        {requestId && (
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            style={{ color: '#dc2626', borderColor: '#fca5a5' }}
                            onClick={() => handleCancelRequest(requestId, 'joined')}
                            disabled={isCancelling}
                            aria-label="Cancel Participation"
                          >
                            <XCircle size={14} className={isCancelling ? 'spin-icon' : ''} aria-hidden="true" />
                            <span>{isCancelling ? 'Cancelling...' : 'Cancel Participation'}</span>
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* 3. Pending Join Requests */}
          {pendingItems.length > 0 && (
            <section style={{ marginBottom: 'var(--space-8)' }}>
              <h2 style={{ fontSize: 'var(--font-size-xl)', fontWeight: 700, marginBottom: 'var(--space-4)' }}>
                Pending Join Requests ({pendingItems.length})
              </h2>
              <div className="activity-grid">
                {pendingItems.map((item) => {
                  const act = item.activity || {};
                  const requestId = item.requestId;
                  const key = requestId || act.id || act._id;
                  const isCancelling = cancellingRequestId === requestId;

                  return (
                    <div key={key} style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                      <ActivityCard activity={act} />
                      <div
                        style={{
                          marginTop: 'var(--space-2)',
                          padding: 'var(--space-3)',
                          backgroundColor: 'var(--bg-surface)',
                          borderRadius: 'var(--radius-md)',
                          border: '1px solid var(--border-color)',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 'var(--space-2)',
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                            <span className="badge badge-yellow">
                              {item.status || 'Pending'}
                            </span>
                            {item.createdAt && (
                              <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-muted)' }}>
                                Requested {formatPlanDate(item.createdAt)}
                              </span>
                            )}
                          </div>
                          {requestId && (
                            <button
                              type="button"
                              className="btn btn-ghost btn-sm"
                              style={{ color: '#dc2626' }}
                              onClick={() => handleCancelRequest(requestId, 'pendingRequests')}
                              disabled={isCancelling}
                              aria-label="Cancel Join Request"
                            >
                              <XCircle size={14} className={isCancelling ? 'spin-icon' : ''} aria-hidden="true" />
                              <span>{isCancelling ? 'Cancelling...' : 'Cancel Request'}</span>
                            </button>
                          )}
                        </div>
                        {item.note && (
                          <div
                            style={{
                              fontSize: 'var(--font-size-xs)',
                              color: 'var(--text-secondary)',
                              backgroundColor: 'var(--bg-surface-subtle)',
                              padding: 'var(--space-2) var(--space-3)',
                              borderRadius: 'var(--radius-sm)',
                              borderLeft: '3px solid var(--color-forest-green)',
                            }}
                          >
                            <strong>Your Note:</strong> {item.note}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* 4. Active Interest Requests */}
          {interestItems.length > 0 && (
            <section style={{ marginBottom: 'var(--space-8)' }}>
              <h2 style={{ fontSize: 'var(--font-size-xl)', fontWeight: 700, marginBottom: 'var(--space-4)' }}>
                Interest Requests ({interestItems.length})
              </h2>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 'var(--space-4)' }}>
                {interestItems.map((item, idx) => {
                  const id = item.id || item._id || `interest-${idx}`;
                  const title = item.category ? item.category.toUpperCase() : (item.title || 'Shared Interest');

                  return (
                    <div
                      key={id}
                      style={{
                        padding: 'var(--space-4)',
                        background: 'var(--bg-surface)',
                        borderRadius: 'var(--radius-lg)',
                        border: '1px solid var(--border-color)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 'var(--space-2)',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span className="badge badge-sage">Interest Request</span>
                        {item.status && <span className="badge badge-yellow">{item.status}</span>}
                      </div>
                      <h3 style={{ fontSize: 'var(--font-size-md)', fontWeight: 600, color: 'var(--text-primary)' }}>
                        {title}
                      </h3>
                      {item.displayArea && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-1)', fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)' }}>
                          <MapPin size={12} aria-hidden="true" />
                          <span>{item.displayArea}</span>
                        </div>
                      )}
                      {(item.timeStart || item.timeEnd) && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-1)', fontSize: 'var(--font-size-xs)', color: 'var(--text-muted)' }}>
                          <Clock size={12} aria-hidden="true" />
                          <span>
                            {formatPlanDate(item.timeStart)} {formatPlanTime(item.timeStart)} – {formatPlanTime(item.timeEnd)}
                          </span>
                        </div>
                      )}
                      {(item.message || item.note) && (
                        <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-muted)', margin: 0 }}>
                          {item.message || item.note}
                        </p>
                      )}
                      {item.createdAt && (
                        <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-muted)' }}>
                          Created {formatPlanDate(item.createdAt)}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* 5. Activity Proposals (Phase 7 Integrated with Accept/Reject/Cancel Actions) */}
          {proposalItems.length > 0 && (
            <section style={{ marginBottom: 'var(--space-8)' }}>
              <h2 style={{ fontSize: 'var(--font-size-xl)', fontWeight: 700, marginBottom: 'var(--space-4)' }}>
                Activity Proposals ({proposalItems.length})
              </h2>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 'var(--space-4)' }}>
                {proposalItems.map((item, idx) => {
                  const id = item.id || item._id || `prop-${idx}`;
                  const isRecipient = item.userRole === 'recipient';
                  const isProposer = item.userRole === 'proposer';

                  const roleLabel = isProposer
                    ? 'Sent by you (Proposer)'
                    : isRecipient
                    ? 'Received (Action Required)'
                    : (item.userRole || 'Proposal');
                  const roleBadgeClass = isRecipient ? 'badge-forest' : 'badge-yellow';

                  const draft = item.activityDraft || {};
                  const title = draft.title || item.title || 'Activity Proposal';
                  const area = draft.displayArea || item.displayArea;
                  const startsAt = draft.startsAt || item.startsAt;
                  const description = draft.description || item.description;
                  const capacity = draft.capacity || item.capacity || 2;
                  const otherUser = isRecipient
                    ? (item.proposerId?.displayName || 'Proposer')
                    : (item.recipientId?.displayName || 'Recipient');

                  const isDeciding = decidingProposalId === id;
                  const isCancelling = cancellingProposalId === id;

                  return (
                    <div
                      key={id}
                      style={{
                        padding: 'var(--space-5)',
                        background: 'var(--bg-surface)',
                        borderRadius: 'var(--radius-lg)',
                        border: '1px solid var(--border-color)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 'var(--space-3)',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
                        <span className={`badge ${roleBadgeClass}`}>
                          {roleLabel}
                        </span>
                        <span className="badge badge-sage">
                          {item.status || 'Pending'}
                        </span>
                      </div>

                      <h3 style={{ fontSize: 'var(--font-size-lg)', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
                        {title}
                      </h3>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)', fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)' }}>
                        {area && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-1)' }}>
                            <MapPin size={13} aria-hidden="true" />
                            <span>{area}</span>
                          </div>
                        )}
                        {startsAt && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-1)' }}>
                            <Clock size={13} aria-hidden="true" />
                            <span>{formatPlanDate(startsAt)} at {formatPlanTime(startsAt)}</span>
                          </div>
                        )}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-1)' }}>
                          <Users size={13} aria-hidden="true" />
                          <span>Max {capacity} participants · With {otherUser}</span>
                        </div>
                      </div>

                      {description && (
                        <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.5 }}>
                          {description}
                        </p>
                      )}

                      {/* Recipient Action Controls (Accept / Reject) */}
                      {isRecipient && item.status === 'pending' && (
                        <div style={{ marginTop: 'var(--space-2)', paddingTop: 'var(--space-3)', borderTop: '1px solid var(--border-color)', display: 'flex', gap: 'var(--space-2)' }}>
                          <button
                            type="button"
                            className="btn btn-primary btn-sm"
                            style={{ flex: 1 }}
                            onClick={() => handleDecideProposal(id, 'accepted')}
                            disabled={isDeciding || isCancelling}
                            aria-label="Accept Proposal"
                          >
                            <Check size={14} className={isDeciding ? 'spin-icon' : ''} aria-hidden="true" />
                            <span>{isDeciding ? 'Processing...' : 'Accept Proposal'}</span>
                          </button>
                          <button
                            type="button"
                            className="btn btn-outline btn-sm"
                            style={{ color: '#dc2626', borderColor: '#fca5a5' }}
                            onClick={() => handleDecideProposal(id, 'rejected')}
                            disabled={isDeciding || isCancelling}
                            aria-label="Reject Proposal"
                          >
                            <X size={14} aria-hidden="true" />
                            <span>Reject</span>
                          </button>
                        </div>
                      )}

                      {/* Proposer Action Controls (Cancel) */}
                      {isProposer && item.status === 'pending' && (
                        <div style={{ marginTop: 'var(--space-2)', paddingTop: 'var(--space-3)', borderTop: '1px solid var(--border-color)', display: 'flex', justifyContent: 'flex-end' }}>
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            style={{ color: '#dc2626' }}
                            onClick={() => handleCancelProposal(id)}
                            disabled={isDeciding || isCancelling}
                            aria-label="Cancel Proposal"
                          >
                            <XCircle size={14} className={isCancelling ? 'spin-icon' : ''} aria-hidden="true" />
                            <span>{isCancelling ? 'Cancelling...' : 'Cancel Proposal'}</span>
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* Empty State */}
          {totalPlansCount === 0 && (
            <div className="empty-discovery-card">
              <Calendar size={32} aria-hidden="true" />
              <h3>No plans yet</h3>
              <p>You haven't organized, joined, or proposed any activities yet.</p>
              <Link to="/" className="btn btn-primary" style={{ marginTop: 'var(--space-4)' }}>
                <span>Find an Activity</span>
              </Link>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
