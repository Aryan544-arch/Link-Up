import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import ActivityGrid from '../components/activities/ActivityGrid';
import { fetchActivities } from '../lib/activityApi';
import apiClient, { normalizeApiError } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import {
  searchAreaSuggestions,
  reverseGeocodeApproximate,
  isSecureContextSupported,
  POPULAR_AREAS
} from '../lib/locationUtils';
import { 
  Search, 
  MapPin, 
  Compass, 
  Navigation, 
  Sparkles, 
  Filter, 
  RefreshCw, 
  CheckCircle2, 
  ShieldCheck,
  ArrowRight,
  PlusCircle,
  SlidersHorizontal,
  X,
  Clock,
  Calendar,
  AlertCircle
} from 'lucide-react';

const CATEGORIES = [
  'All',
  'Outdoor & Sports',
  'Study & Focus',
  'Fitness',
  'Social & Board Games',
  'Creative & Crafts',
  'Food & Coffee',
  'Music & Jamming',
];

const SKILL_LEVELS = [
  'All',
  'Beginner friendly',
  'Intermediate',
  'Advanced / Experienced',
];

/**
 * Computes date bounds for supported startDate/endDate backend filters
 */
function getDateBounds(timeOption) {
  const now = new Date();

  if (timeOption === 'today') {
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
    return { startDate: start.toISOString(), endDate: end.toISOString() };
  }

  if (timeOption === 'weekend') {
    const dayOfWeek = now.getDay(); // 0 is Sunday, 6 is Saturday
    const daysUntilSaturday = (6 - dayOfWeek + 7) % 7;
    const saturday = new Date(now.getFullYear(), now.getMonth(), now.getDate() + daysUntilSaturday, 0, 0, 0);
    const sunday = new Date(saturday.getFullYear(), saturday.getMonth(), saturday.getDate() + 1, 23, 59, 59);
    return { startDate: saturday.toISOString(), endDate: sunday.toISOString() };
  }

  if (timeOption === 'upcoming') {
    return { startDate: now.toISOString(), endDate: undefined };
  }

  return { startDate: undefined, endDate: undefined };
}

export default function DiscoveryPage() {
  // Filter States (Only supported backend filters)
  const [clientSearch, setClientSearch] = useState('');
  const [category, setCategory] = useState('All');
  const [skillLevel, setSkillLevel] = useState('All');
  const [maxBudgetOption, setMaxBudgetOption] = useState('all'); // 'all' | '0' | '15' | '30' | '50'
  const [timeOption, setTimeOption] = useState('all'); // 'all' | 'today' | 'weekend' | 'upcoming'
  const [radiusKm, setRadiusKm] = useState(3); // Default 3 km per PRD
  
  const { user, isAuthenticated } = useAuth();

  // Location states (GPS and Manual Area are separate flows)
  const [coords, setCoords] = useState(null); // { lat, lng }
  const [selectedAreaName, setSelectedAreaName] = useState(null);
  const [locationSource, setLocationSource] = useState('none'); // 'none' | 'gps' | 'manual'
  const [gpsStatus, setGpsStatus] = useState('idle'); // 'idle' | 'requesting' | 'granted' | 'permission_denied' | 'timeout' | 'unsupported' | 'insecure_context' | 'error'
  const [locationNotice, setLocationNotice] = useState(null);

  // Manual Area Autocomplete States (strictly for manual selection)
  const [showAreaPicker, setShowAreaPicker] = useState(false);
  const [areaSearchInput, setAreaSearchInput] = useState('');

  // Interest Request Modal States (demand-first matching)
  const [showInterestModal, setShowInterestModal] = useState(false);
  const [interestSubmitting, setInterestSubmitting] = useState(false);
  const [interestSuccess, setInterestSuccess] = useState(null);
  const [interestError, setInterestError] = useState(null);
  const [interestForm, setInterestForm] = useState({
    category: 'fitness',
    title: '',
    timeStart: '',
    timeEnd: '',
    displayArea: 'Central Park South, New York',
    maxBudget: 0,
    skillLevel: 'all-levels',
    radiusKm: 3
  });

  // Data & Pagination States
  const [activities, setActivities] = useState([]);
  const [pagination, setPagination] = useState(null);
  const [page, setPage] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState(null);

  // Active request tracking to prevent race conditions
  const activeRequestIdRef = useRef(0);
  const abortControllerRef = useRef(null);

  // Explicit user action to request device GPS location
  const handleRequestGpsLocation = () => {
    // Keep flows separate: close manual area picker if open
    setShowAreaPicker(false);

    // 1. Secure Context Check (HTTPS or localhost required for geolocation)
    if (!isSecureContextSupported()) {
      setGpsStatus('insecure_context');
      setLocationSource('none');
      setLocationNotice(
        'Device GPS is restricted to secure contexts (HTTPS or localhost). Switch to manual area selection to choose a neighborhood.'
      );
      return;
    }

    // 2. Geolocation API availability
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setGpsStatus('unsupported');
      setLocationSource('none');
      setLocationNotice('Browser geolocation is not supported on this device or browser.');
      return;
    }

    // 3. Request actual device coordinates
    setGpsStatus('requesting');
    setLocationNotice('Requesting device location coordinates...');

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        // Actual device coordinates: never fabricated, never substituting a landmark
        const lat = Number(pos.coords.latitude.toFixed(6));
        const lng = Number(pos.coords.longitude.toFixed(6));
        setCoords({ lat, lng });
        setLocationSource('gps');
        setGpsStatus('granted');
        const friendlyArea = reverseGeocodeApproximate(lat, lng);
        setSelectedAreaName(friendlyArea ? `${friendlyArea} (GPS)` : `GPS (${lat.toFixed(4)}°, ${lng.toFixed(4)}°)`);
        setLocationNotice(`Device location acquired (${lat.toFixed(4)}°, ${lng.toFixed(4)}°).`);
        setPage(1);
      },
      (err) => {
        setCoords(null);
        setLocationSource('none');
        if (err.code === 1) {
          // PERMISSION_DENIED
          setGpsStatus('permission_denied');
          setLocationNotice('GPS permission was denied by the browser or user.');
        } else if (err.code === 3) {
          // TIMEOUT
          setGpsStatus('timeout');
          setLocationNotice('Device location request timed out after 10 seconds.');
        } else {
          setGpsStatus('error');
          setLocationNotice(err.message || 'Unable to retrieve device GPS coordinates.');
        }
        // Do NOT automatically show manual area suggestion dropdown; user decides whether to retry or switch
      },
      { timeout: 10000, enableHighAccuracy: true }
    );
  };

  const handleSelectArea = (area) => {
    setCoords({ lat: area.lat, lng: area.lng });
    setSelectedAreaName(area.displayArea || area.name);
    setLocationSource('manual');
    setGpsStatus('idle');
    setLocationNotice(`Discovery centered at ${area.displayArea || area.name}`);
    setShowAreaPicker(false);
    setAreaSearchInput('');
    setPage(1);
  };

  const handleClearLocation = () => {
    setCoords(null);
    setSelectedAreaName(null);
    setLocationSource('none');
    setGpsStatus('idle');
    setLocationNotice(null);
    setShowAreaPicker(false);
    setPage(1);
  };

  // Submit Interest Request (POST /api/interest-requests)
  const handleSubmitInterestRequest = async (e) => {
    e.preventDefault();
    if (!isAuthenticated) return;
    setInterestSubmitting(true);
    setInterestError(null);
    setInterestSuccess(null);

    try {
      const now = new Date();
      const defaultStart = interestForm.timeStart
        ? new Date(interestForm.timeStart)
        : new Date(now.getTime() + 2 * 3600 * 1000);
      const defaultEnd = interestForm.timeEnd
        ? new Date(interestForm.timeEnd)
        : new Date(defaultStart.getTime() + 2 * 3600 * 1000);

      // Resolve area coordinates
      const matchedArea = POPULAR_AREAS.find((a) =>
        a.displayArea.toLowerCase().includes(interestForm.displayArea.toLowerCase())
      ) || POPULAR_AREAS[0];

      const payload = {
        category: interestForm.category.toLowerCase(),
        title: interestForm.title.trim() || `${interestForm.category} Meetup`,
        timeStart: defaultStart.toISOString(),
        timeEnd: defaultEnd.toISOString(),
        displayArea: interestForm.displayArea.trim() || matchedArea.displayArea,
        location: {
          type: 'Point',
          coordinates: [matchedArea.lng, matchedArea.lat]
        },
        radiusKm: Number(interestForm.radiusKm) || 3,
        maxBudget: Number(interestForm.maxBudget) || 0,
        skillLevel: interestForm.skillLevel || 'all-levels'
      };

      const res = await apiClient.post('/api/interest-requests', payload);
      setInterestSuccess({
        message: 'Interest Request successfully posted! Matching candidates will appear in My Plans.',
        data: res.data?.data
      });
    } catch (err) {
      const normalized = err.normalized || normalizeApiError(err);
      setInterestError(normalized.message || 'Failed to post interest request.');
    } finally {
      setInterestSubmitting(false);
    }
  };

  // Reset all filters to default state
  const handleResetFilters = () => {
    setClientSearch('');
    setCategory('All');
    setSkillLevel('All');
    setMaxBudgetOption('all');
    setTimeOption('all');
    setRadiusKm(3);
    setCoords(null);
    setSelectedAreaName(null);
    setLocationSource('none');
    setGpsStatus('idle');
    setLocationNotice(null);
    setShowAreaPicker(false);
    setPage(1);
  };

  // Load activities using verified backend filters
  const loadActivities = useCallback(async (isPageAppend = false, targetPage = 1) => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    const currentRequestId = ++activeRequestIdRef.current;

    if (isPageAppend) {
      setIsLoadingMore(true);
    } else {
      setIsLoading(true);
    }
    setError(null);

    const { startDate, endDate } = getDateBounds(timeOption);
    const maxBudget = maxBudgetOption === 'all' ? undefined : Number(maxBudgetOption);

    const hasCoords = Boolean(
      coords &&
      typeof coords.lat === 'number' &&
      typeof coords.lng === 'number' &&
      !isNaN(coords.lat) &&
      !isNaN(coords.lng)
    );

    // Filter payload contains ONLY verified supported fields:
    // lat, lng, radiusKm, category, skillLevel, maxBudget, startDate, endDate, page, limit
    const filterParams = {
      category,
      skillLevel: skillLevel !== 'All' ? skillLevel : undefined,
      maxBudget,
      startDate,
      endDate,
      page: targetPage,
      limit: 12,
    };

    if (hasCoords) {
      // Send valid coordinates and requested radius together
      filterParams.lat = coords.lat;
      filterParams.lng = coords.lng;
      filterParams.radiusKm = radiusKm;
    } else if (radiusKm === 3) {
      // Default 3 km allowed by backend without coordinates
      filterParams.radiusKm = 3;
    } else {
      // Radius changed from default (e.g. 1, 5, 10, 25 km) but no coordinates available yet.
      // Omit radiusKm from API request to avoid 400 error while prompting the user to select location.
      filterParams.radiusKm = undefined;
    }

    try {
      const result = await fetchActivities(filterParams, { signal: abortController.signal });

      if (currentRequestId === activeRequestIdRef.current) {
        if (isPageAppend) {
          // Preserve already-loaded activities when appending page
          setActivities((prev) => [...prev, ...result.activities]);
        } else {
          setActivities(result.activities);
        }
        setPagination(result.pagination);
        setPage(targetPage);
        setError(null);
      }
    } catch (err) {
      if (err.name === 'CanceledError' || err.name === 'AbortError') {
        return;
      }

      if (currentRequestId === activeRequestIdRef.current) {
        const normalized = err.normalized || normalizeApiError(err);
        if (normalized.code === 'COORDINATES_REQUIRED') {
          normalized.message = `Coordinates (lat, lng) are required when specifying a search radius (${radiusKm} km). Please use GPS or select a neighborhood.`;
        }
        setError(normalized);
        if (!isPageAppend) {
          setActivities([]);
        }
      }
    } finally {
      if (currentRequestId === activeRequestIdRef.current) {
        setIsLoading(false);
        setIsLoadingMore(false);
      }
    }
  }, [category, skillLevel, maxBudgetOption, timeOption, radiusKm, coords]);

  // Fetch when filters change (resets to page 1)
  useEffect(() => {
    loadActivities(false, 1);
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [loadActivities]);

  // Handle Load More (appends next page while preserving loaded activities)
  const handleLoadMore = () => {
    const nextPage = page + 1;
    loadActivities(true, nextPage);
  };

  // Client-side text filter over loaded activities (backend text search is not supported)
  const displayedActivities = useMemo(() => {
    if (!clientSearch.trim()) return activities;
    const term = clientSearch.trim().toLowerCase();
    return activities.filter((act) => 
      (act.title && act.title.toLowerCase().includes(term)) ||
      (act.displayArea && act.displayArea.toLowerCase().includes(term)) ||
      (act.category && act.category.toLowerCase().includes(term))
    );
  }, [activities, clientSearch]);

  const hasActiveFilters = category !== 'All' || 
    skillLevel !== 'All' || 
    maxBudgetOption !== 'all' || 
    timeOption !== 'all' || 
    coords !== null || 
    clientSearch !== '' ||
    radiusKm !== 3;

  return (
    <div className="discovery-page-root">
      {/* Welcoming Hero Section */}
      <section className="hero-section" aria-labelledby="discoveryHeroHeading">
        <div className="container hero-content">
          <div className="hero-pill">
            <Sparkles size={14} className="feature-icon-yellow" aria-hidden="true" />
            <span>Real-world meetups within your neighborhood</span>
          </div>

          <h1 id="discoveryHeroHeading" className="hero-title">
            Find your people. <br />
            <span className="hero-title-highlight">Make it happen.</span>
          </h1>

          <p className="hero-subtitle">
            Discover activities organized by young adults and students nearby, or post an interest request
            to match with others when nothing fits your schedule.
          </p>

          <div className="hero-features-bar">
            <div className="hero-feature-item">
              <MapPin size={16} className="feature-icon-forest" aria-hidden="true" />
              <span>3 km Default Radius</span>
            </div>
            <div className="hero-feature-item">
              <CheckCircle2 size={16} className="feature-icon-yellow" aria-hidden="true" />
              <span>No Surprise Commitments</span>
            </div>
            <div className="hero-feature-item">
              <ShieldCheck size={16} className="feature-icon-sage" aria-hidden="true" />
              <span>Privacy by Design</span>
            </div>
          </div>
        </div>
      </section>

      {/* Main Discovery Feed & Filters Container */}
      <section className="container discovery-section" aria-label="Activity Discovery Feed">
        {/* Filter & Search Toolbar */}
        <div className="discovery-toolbar" role="search" aria-label="Activity Search and Filters">
          {/* Search Field & Location Selector */}
          <div className="discovery-search-row">
            <div className="search-input-wrap">
              <Search size={18} className="search-input-icon" aria-hidden="true" />
              <input
                type="text"
                className="input search-input-field"
                placeholder="Filter loaded activities by title or category..."
                value={clientSearch}
                onChange={(e) => setClientSearch(e.target.value)}
                aria-label="Filter loaded activities"
              />
            </div>

            {/* Location & Radius Controls */}
            <div className="location-selector-wrap">
              <span className="radius-badge-pill" title="Radius used for geospatial discovery">
                <MapPin size={13} aria-hidden="true" />
                <span>Radius:</span>
                <select
                  aria-label="Select search radius in kilometers"
                  value={radiusKm}
                  onChange={(e) => {
                    const newRadius = Number(e.target.value);
                    setRadiusKm(newRadius);
                    setPage(1);
                    if (!coords && newRadius !== 3) {
                      setLocationNotice(`Search radius of ${newRadius} km requires a location. Please use GPS or choose a neighborhood.`);
                    }
                  }}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    fontWeight: 700,
                    cursor: 'pointer',
                    color: 'inherit',
                    outline: 'none',
                  }}
                >
                  <option value={1}>1 km</option>
                  <option value={3}>3 km (default)</option>
                  <option value={5}>5 km</option>
                  <option value={10}>10 km</option>
                  <option value={25}>25 km</option>
                </select>
              </span>

              {/* Location Selector Controls (GPS and Manual Area are separate flows) */}
              {coords ? (
                <button
                  type="button"
                  className="btn btn-sm btn-secondary"
                  onClick={handleClearLocation}
                  title="Clear location filter"
                >
                  <span>📍 {selectedAreaName ? selectedAreaName.split(',')[0] : 'GPS Active'}</span>
                  <span style={{ marginLeft: 6, opacity: 0.7 }}>✕</span>
                </button>
              ) : (
                <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                  <button
                    type="button"
                    className="btn btn-sm btn-outline"
                    onClick={handleRequestGpsLocation}
                    disabled={gpsStatus === 'requesting'}
                    title="Request device GPS location"
                  >
                    <Navigation size={13} aria-hidden="true" />
                    <span>
                      {gpsStatus === 'requesting' ? 'Acquiring GPS...' : 'Use GPS'}
                    </span>
                  </button>

                  <button
                    type="button"
                    className={`btn btn-sm ${showAreaPicker ? 'btn-primary' : 'btn-outline'}`}
                    onClick={() => setShowAreaPicker((prev) => !prev)}
                    title="Choose a neighborhood or area manually"
                  >
                    <Compass size={13} aria-hidden="true" />
                    <span>Choose Area</span>
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Area Picker Dropdown with Autocomplete Suggestions (Manual Area flow strictly) */}
          {showAreaPicker && (
            <div
              style={{
                marginTop: 'var(--space-3)',
                padding: 'var(--space-4)',
                background: 'var(--bg-surface)',
                borderRadius: 'var(--radius-lg)',
                border: '1px solid var(--border-color)',
                boxShadow: 'var(--shadow-md)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-3)' }}>
                <span style={{ fontSize: 'var(--font-size-sm)', fontWeight: 700 }}>
                  Select Neighborhood or Campus Landmark
                </span>
                <button
                  type="button"
                  className="btn btn-ghost btn-xs"
                  onClick={() => setShowAreaPicker(false)}
                >
                  <X size={14} aria-hidden="true" />
                </button>
              </div>

              <div style={{ position: 'relative', marginBottom: 'var(--space-3)' }}>
                <input
                  type="text"
                  className="input"
                  style={{ width: '100%', paddingLeft: 'var(--space-8)' }}
                  placeholder="Search areas (e.g. Central Park, Greenwich Village, Brooklyn...)"
                  value={areaSearchInput}
                  onChange={(e) => setAreaSearchInput(e.target.value)}
                  autoFocus
                />
                <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)', maxHeight: '180px', overflowY: 'auto' }}>
                {searchAreaSuggestions(areaSearchInput).map((area) => (
                  <button
                    key={area.name}
                    type="button"
                    className="btn btn-ghost btn-sm"
                    style={{ justifyContent: 'flex-start', textAlign: 'left', padding: 'var(--space-2) var(--space-3)' }}
                    onClick={() => handleSelectArea(area)}
                  >
                    <MapPin size={13} style={{ color: 'var(--color-forest-green)', marginRight: 'var(--space-2)', flexShrink: 0 }} aria-hidden="true" />
                    <span>{area.displayArea}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {locationNotice && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginTop: 'var(--space-2)',
                gap: 'var(--space-2)',
                padding: 'var(--space-2) var(--space-3)',
                backgroundColor: 'var(--bg-surface-subtle)',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border-color)'
              }}
            >
              <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)', margin: 0 }}>
                {locationNotice}
              </p>
              {(['permission_denied', 'timeout', 'insecure_context', 'unsupported', 'error'].includes(gpsStatus) || (!coords && radiusKm !== 3)) && (
                <div style={{ display: 'flex', gap: 'var(--space-1)', flexShrink: 0 }}>
                  {['permission_denied', 'timeout', 'error'].includes(gpsStatus) && (
                    <button type="button" className="btn btn-ghost btn-xs" onClick={handleRequestGpsLocation}>
                      Retry GPS
                    </button>
                  )}
                  <button
                    type="button"
                    className="btn btn-outline btn-xs"
                    onClick={() => setShowAreaPicker(true)}
                  >
                    Choose Area
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Category Filter Chips Bar */}
          <div className="filter-chips-bar" role="toolbar" aria-label="Category Filters">
            {CATEGORIES.map((cat) => (
              <button
                key={cat}
                type="button"
                className={`filter-chip ${category === cat ? 'active' : ''}`}
                onClick={() => {
                  setCategory(cat);
                  setPage(1);
                }}
                aria-pressed={category === cat}
              >
                <span>{cat}</span>
              </button>
            ))}
          </div>

          {/* Supported Backend Filter Dropdowns: Skill Level, Max Budget, Date Range */}
          <div className="filter-dropdowns-row">
            <div className="filter-select-group">
              <label htmlFor="skillSelect">Skill Level:</label>
              <select
                id="skillSelect"
                className="filter-select-compact"
                value={skillLevel}
                onChange={(e) => {
                  setSkillLevel(e.target.value);
                  setPage(1);
                }}
              >
                {SKILL_LEVELS.map((lvl) => (
                  <option key={lvl} value={lvl}>{lvl}</option>
                ))}
              </select>
            </div>

            <div className="filter-select-group">
              <label htmlFor="budgetSelect">Max Budget:</label>
              <select
                id="budgetSelect"
                className="filter-select-compact"
                value={maxBudgetOption}
                onChange={(e) => {
                  setMaxBudgetOption(e.target.value);
                  setPage(1);
                }}
              >
                <option value="all">Any Budget</option>
                <option value="0">Free Only ($0)</option>
                <option value="15">Up to $15</option>
                <option value="30">Up to $30</option>
                <option value="50">Up to $50</option>
              </select>
            </div>

            <div className="filter-select-group">
              <label htmlFor="timeSelect">Date & Time:</label>
              <select
                id="timeSelect"
                className="filter-select-compact"
                value={timeOption}
                onChange={(e) => {
                  setTimeOption(e.target.value);
                  setPage(1);
                }}
              >
                <option value="all">Any Date</option>
                <option value="today">Today</option>
                <option value="weekend">This Weekend</option>
                <option value="upcoming">Upcoming</option>
              </select>
            </div>

            {hasActiveFilters && (
              <button
                type="button"
                className="btn btn-ghost btn-sm filter-reset-btn"
                onClick={handleResetFilters}
              >
                <RefreshCw size={13} aria-hidden="true" />
                <span>Reset Filters</span>
              </button>
            )}
          </div>
        </div>

        {/* Section Header */}
        <div className="section-header" style={{ marginBottom: 'var(--space-4)', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 'var(--space-3)' }}>
          <div>
            <h2 className="section-title">Explore Activities</h2>
            <p className="section-subtitle">
              {coords
                ? `Showing published meetups within ${radiusKm} km of ${selectedAreaName || 'device coordinates'}`
                : radiusKm !== 3
                ? `Showing all published meetups — select a location or use GPS to filter within ${radiusKm} km`
                : `Showing published meetups within default 3 km radius`}
            </p>
          </div>
          <Link to="/create" className="btn btn-primary btn-sm">
            <PlusCircle size={15} aria-hidden="true" />
            <span>Host an Activity</span>
          </Link>
        </div>

        {/* Activity Grid (Handles Skeletons, Error Retry, Empty States, Cards, and Load More) */}
        <ActivityGrid
          activities={displayedActivities}
          isLoading={isLoading}
          error={error}
          onRetry={() => loadActivities(false, 1)}
          onResetFilters={handleResetFilters}
          pagination={pagination}
          onLoadMore={handleLoadMore}
          isLoadingMore={isLoadingMore}
          onPostInterest={() => {
            if (isAuthenticated) {
              setShowInterestModal(true);
            } else {
              window.location.assign('/login?redirect=/');
            }
          }}
        />

        {/* Demand-first Matching Banner (PRD §4 Journey C & Journey F) */}
        <div className="demand-match-banner">
          <div className="demand-match-icon" aria-hidden="true">
            <Sparkles size={26} />
          </div>
          <div className="demand-match-text">
            <h3 className="demand-match-title">Nothing fits your schedule?</h3>
            <p className="demand-match-desc">
              Save an <strong>Interest Request</strong> with your preferred time, budget, and activity type. 
              LinkUp matches you deterministically with compatible people nearby — 
              <em>matches are non-binding suggestions and will never automatically publish an activity or commit your attendance</em>.
            </p>
          </div>
          {isAuthenticated ? (
            <button
              type="button"
              className="btn btn-accent"
              onClick={() => setShowInterestModal(true)}
            >
              <Sparkles size={16} aria-hidden="true" />
              <span>Post an Interest Request</span>
              <ArrowRight size={16} aria-hidden="true" />
            </button>
          ) : (
            <Link to="/login?redirect=/" className="btn btn-accent">
              <span>Sign In to Post Interest</span>
              <ArrowRight size={16} aria-hidden="true" />
            </Link>
          )}
        </div>

        {/* Interest Request Modal for Authenticated Users */}
        {showInterestModal && (
          <div
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: 'rgba(0, 0, 0, 0.5)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 1000,
              padding: 'var(--space-4)',
            }}
            role="dialog"
            aria-modal="true"
            aria-labelledby="interest-modal-title"
          >
            <div
              style={{
                background: 'var(--bg-surface)',
                borderRadius: 'var(--radius-xl)',
                border: '1px solid var(--border-color)',
                width: '100%',
                maxWidth: '520px',
                padding: 'var(--space-6)',
                boxShadow: 'var(--shadow-xl)',
                maxHeight: '90vh',
                overflowY: 'auto',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-4)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                  <Sparkles size={20} color="var(--color-forest-green)" />
                  <h3 id="interest-modal-title" style={{ margin: 0, fontSize: 'var(--font-size-lg)', fontWeight: 700 }}>
                    Post an Interest Request
                  </h3>
                </div>
                <button
                  type="button"
                  className="btn btn-ghost btn-xs"
                  onClick={() => {
                    setShowInterestModal(false);
                    setInterestSuccess(null);
                    setInterestError(null);
                  }}
                  aria-label="Close dialog"
                >
                  <X size={16} aria-hidden="true" />
                </button>
              </div>

              {interestSuccess ? (
                <div>
                  <div style={{ padding: 'var(--space-4)', backgroundColor: 'var(--bg-surface-subtle)', borderRadius: 'var(--radius-md)', borderLeft: '4px solid var(--color-forest-green)', marginBottom: 'var(--space-4)' }}>
                    <p style={{ fontWeight: 600, color: 'var(--color-forest-green)', margin: '0 0 var(--space-2) 0' }}>
                      ✓ {interestSuccess.message}
                    </p>
                    <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)', margin: 0 }}>
                      Non-binding proposals will appear in your "My Plans" tab once compatible peers are identified.
                    </p>
                  </div>
                  <div style={{ display: 'flex', gap: 'var(--space-2)', justifyContent: 'flex-end' }}>
                    <Link to="/plans" className="btn btn-primary btn-sm">
                      Go to My Plans
                    </Link>
                    <button
                      type="button"
                      className="btn btn-outline btn-sm"
                      onClick={() => {
                        setShowInterestModal(false);
                        setInterestSuccess(null);
                      }}
                    >
                      Done
                    </button>
                  </div>
                </div>
              ) : (
                <form onSubmit={handleSubmitInterestRequest} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
                  {interestError && (
                    <div style={{ padding: 'var(--space-3)', backgroundColor: '#fee2e2', borderRadius: 'var(--radius-sm)', color: '#991b1b', fontSize: 'var(--font-size-xs)' }}>
                      {interestError}
                    </div>
                  )}

                  <div>
                    <label className="form-label">Category</label>
                    <select
                      className="input"
                      value={interestForm.category}
                      onChange={(e) => setInterestForm({ ...interestForm, category: e.target.value })}
                      required
                    >
                      {CATEGORIES.filter((c) => c !== 'All').map((c) => (
                        <option key={c} value={c.toLowerCase()}>{c}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="form-label">Title / Note (Optional)</label>
                    <input
                      type="text"
                      className="input"
                      placeholder="e.g. Looking for running buddy or study group"
                      value={interestForm.title}
                      onChange={(e) => setInterestForm({ ...interestForm, title: e.target.value })}
                    />
                  </div>

                  <div>
                    <label className="form-label">Meeting Area / Neighborhood</label>
                    <select
                      className="input"
                      value={interestForm.displayArea}
                      onChange={(e) => setInterestForm({ ...interestForm, displayArea: e.target.value })}
                    >
                      {POPULAR_AREAS.map((a) => (
                        <option key={a.name} value={a.displayArea}>{a.displayArea}</option>
                      ))}
                    </select>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' }}>
                    <div>
                      <label className="form-label">Skill Level</label>
                      <select
                        className="input"
                        value={interestForm.skillLevel}
                        onChange={(e) => setInterestForm({ ...interestForm, skillLevel: e.target.value })}
                      >
                        <option value="all-levels">All Levels</option>
                        <option value="beginner">Beginner</option>
                        <option value="intermediate">Intermediate</option>
                        <option value="advanced">Advanced</option>
                      </select>
                    </div>

                    <div>
                      <label className="form-label">Max Budget ($)</label>
                      <input
                        type="number"
                        min="0"
                        className="input"
                        value={interestForm.maxBudget}
                        onChange={(e) => setInterestForm({ ...interestForm, maxBudget: e.target.value })}
                      />
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: 'var(--space-2)', justifyContent: 'flex-end', marginTop: 'var(--space-2)' }}>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() => setShowInterestModal(false)}
                      disabled={interestSubmitting}
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="btn btn-accent btn-sm"
                      disabled={interestSubmitting}
                    >
                      {interestSubmitting ? 'Posting...' : 'Post Request'}
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
