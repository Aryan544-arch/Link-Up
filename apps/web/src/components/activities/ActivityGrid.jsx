import React from 'react';
import { Link } from 'react-router-dom';
import ActivityCard from './ActivityCard';
import AlertBanner from '../common/AlertBanner';
import { Sparkles, RefreshCw, Compass, ArrowRight } from 'lucide-react';

export default function ActivityGrid({
  activities = [],
  isLoading = false,
  error = null,
  onRetry,
  onResetFilters,
  onSelectActivity,
  pagination = null,
  onLoadMore,
  isLoadingMore = false,
}) {
  // Loading Skeleton State
  if (isLoading && activities.length === 0) {
    return (
      <div className="activity-grid" aria-busy="true" aria-label="Loading activities">
        {[1, 2, 3, 4, 5, 6].map((n) => (
          <div key={n} className="activity-card skeleton-card">
            <div className="skeleton-bar" style={{ width: '30%', height: '22px' }} />
            <div className="skeleton-bar" style={{ width: '80%', height: '26px', marginTop: '12px' }} />
            <div className="skeleton-bar" style={{ width: '60%', height: '16px' }} />
            <div style={{ marginTop: 'auto', paddingTop: '16px', display: 'flex', justifyContent: 'space-between' }}>
              <div className="skeleton-bar" style={{ width: '40%', height: '18px' }} />
              <div className="skeleton-bar" style={{ width: '30%', height: '32px', borderRadius: '999px' }} />
            </div>
          </div>
        ))}
      </div>
    );
  }

  // Error State (Network failure or Server error)
  if (error) {
    return (
      <div style={{ padding: 'var(--space-6) 0' }}>
        <AlertBanner
          type="error"
          title={error.isNetworkError ? "Backend Server Unavailable" : "Failed to Load Activities"}
          message={
            error.isNetworkError
              ? "The LinkUp REST API (http://localhost:3000) could not be reached. Ensure the backend server is running and try again."
              : error.message || "An unexpected error occurred while fetching activities."
          }
          onRetry={onRetry}
          retryLabel="Retry Connection"
        />
      </div>
    );
  }

  // Empty State (Zero activities found)
  if (activities.length === 0) {
    return (
      <div className="empty-discovery-card" role="status" aria-label="No activities found">
        <div className="empty-icon-bubble">
          <Compass size={32} aria-hidden="true" />
        </div>

        <h3 className="empty-title">No activities found nearby</h3>
        <p className="empty-desc">
          No published activities match your current search, filters, or area within the <strong>3 km</strong> discovery radius.
        </p>

        <div className="empty-actions-row">
          {onResetFilters && (
            <button
              type="button"
              className="btn btn-outline"
              onClick={onResetFilters}
            >
              <RefreshCw size={14} aria-hidden="true" />
              <span>Reset All Filters</span>
            </button>
          )}

          <Link to="/signup" className="btn btn-accent">
            <Sparkles size={16} aria-hidden="true" />
            <span>Post an Interest Request</span>
            <ArrowRight size={14} aria-hidden="true" />
          </Link>
        </div>
      </div>
    );
  }

  // Success State with Activity Cards Grid
  return (
    <div>
      <div className="activity-grid" role="feed" aria-label="Nearby activities list">
        {activities.map((act) => (
          <ActivityCard
            key={act.id || act._id}
            activity={act}
            onSelect={onSelectActivity}
          />
        ))}
      </div>

      {/* Pagination / Continuation mechanism only if confirmed by backend */}
      {pagination?.hasMore && (
        <div style={{ textAlign: 'center', marginTop: 'var(--space-8)' }}>
          <button
            type="button"
            className="btn btn-outline btn-lg"
            onClick={onLoadMore}
            disabled={isLoadingMore}
            aria-busy={isLoadingMore}
          >
            {isLoadingMore ? (
              <span>Loading more...</span>
            ) : (
              <span>Load More Activities</span>
            )}
          </button>
        </div>
      )}
    </div>
  );
}
