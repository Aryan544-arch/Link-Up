import React from 'react';
import { Link } from 'react-router-dom';
import { MapPin, Clock, Users, ArrowUpRight, DollarSign } from 'lucide-react';
import { formatDisplayArea } from '../../lib/locationUtils';

/**
 * Format timestamp into friendly date/time representation
 */
function formatActivityTime(startsAt) {
  if (!startsAt) return 'Time TBA';
  try {
    const date = new Date(startsAt);
    if (isNaN(date.getTime())) return String(startsAt);
    
    return date.toLocaleDateString(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
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

export default function ActivityCard({ activity, onSelect }) {
  if (!activity) return null;

  const {
    id,
    _id,
    title = 'Untitled Activity',
    category = 'General',
    description = '',
    area = 'Approximate meeting area',
    displayArea,
    startsAt,
    budget,
    cost,
    capacity,
    spotsRemaining,
    placesRemaining,
    participantsCount,
    placesFilled,
    organizer,
    organizerName,
    distanceKm,
  } = activity;

  const activityId = id || _id;
  const organizerDisplay = organizer?.displayName || organizerName || 'LinkUp Organizer';
  const displayBudget = budget || cost || 'Free';
  const meetingArea = formatDisplayArea(displayArea || area, activity.location?.coordinates);
  const badgeClass = getCategoryBadgeClass(category);

  // Compute spots available defensively
  const remaining = typeof placesRemaining === 'number' ? placesRemaining : spotsRemaining;
  const filled = typeof placesFilled === 'number' ? placesFilled : participantsCount;

  let spotsText = null;
  if (typeof remaining === 'number') {
    spotsText = `${remaining} spots left`;
  } else if (typeof capacity === 'number' && typeof filled === 'number') {
    spotsText = `${Math.max(0, capacity - filled)} of ${capacity} spots left`;
  } else if (typeof capacity === 'number') {
    spotsText = `Capacity: ${capacity} people`;
  }

  return (
    <article className="activity-card" aria-labelledby={`act-title-${activityId}`}>
      <div className="activity-card-top">
        <span className={`badge ${badgeClass}`}>{category}</span>
        {typeof distanceKm === 'number' && (
          <span className="badge badge-forest" title="Distance from search location">
            📍 {distanceKm.toFixed(1)} km away
          </span>
        )}
      </div>

      <div>
        <h3 id={`act-title-${activityId}`} className="activity-card-title">
          {title}
        </h3>
        {description && (
          <p className="activity-card-desc">
            {description}
          </p>
        )}
      </div>

      <div className="activity-meta-list">
        <div className="activity-meta-row" title="Scheduled time">
          <Clock size={14} aria-hidden="true" />
          <span>{formatActivityTime(startsAt)}</span>
        </div>

        <div className="activity-meta-row" title="General neighborhood / approximate area (exact details revealed after approval)">
          <MapPin size={14} aria-hidden="true" />
          <span>{meetingArea}</span>
        </div>

        <div className="activity-meta-row" title="Organizer & Budget">
          <Users size={14} aria-hidden="true" />
          <span>Organized by {organizerDisplay} · {displayBudget}</span>
        </div>
      </div>

      <div className="activity-card-footer">
        {spotsText ? (
          <span className="spots-badge">{spotsText}</span>
        ) : (
          <span className="spots-badge" style={{ color: 'var(--text-muted)' }}>Open for requests</span>
        )}

        <Link
          to={`/activities/${activityId}`}
          className="btn btn-primary btn-sm"
          onClick={() => {
            if (onSelect) {
              onSelect(activity);
            }
          }}
          aria-label={`View details for ${title}`}
        >
          <span>View Details</span>
          <ArrowUpRight size={14} aria-hidden="true" />
        </Link>
      </div>
    </article>
  );
}
