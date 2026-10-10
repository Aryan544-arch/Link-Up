import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import ActivityGrid from '../components/activities/ActivityGrid';
import { fetchActivities } from '../lib/activityApi';
import { normalizeApiError } from '../lib/api';
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
  SlidersHorizontal
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
  
  // Ephemeral Foreground Location (lat/lng sent together or both omitted)
  const [coords, setCoords] = useState(null); // { lat, lng }
  const [locationStatus, setLocationStatus] = useState('idle'); // 'idle' | 'requesting' | 'granted' | 'denied'
  const [locationNotice, setLocationNotice] = useState(null);

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

  // Explicit user action to request browser geolocation
  const handleRequestLocation = () => {
    if (!navigator.geolocation) {
      setLocationStatus('denied');
      setLocationNotice('Browser geolocation is not supported on this device.');
      return;
    }

    setLocationStatus('requesting');
    setLocationNotice(null);

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        // Ephemeral foreground location only; lat and lng paired together
        setCoords({
          lat: Number(pos.coords.latitude.toFixed(4)),
          lng: Number(pos.coords.longitude.toFixed(4)),
        });
        setLocationStatus('granted');
        setLocationNotice('Using foreground coordinates within radius.');
        setPage(1);
      },
      (err) => {
        setLocationStatus('denied');
        setCoords(null);
        setLocationNotice(
          err.code === 1
            ? 'Location permission denied. Discovery will use category and criteria filters.'
            : 'Unable to retrieve location coordinates.'
        );
      },
      { timeout: 8000, enableHighAccuracy: false }
    );
  };

  const handleClearLocation = () => {
    setCoords(null);
    setLocationStatus('idle');
    setLocationNotice(null);
    setPage(1);
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
    setLocationStatus('idle');
    setLocationNotice(null);
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

    // Filter payload contains ONLY verified supported fields:
    // lat, lng, radiusKm, category, skillLevel, maxBudget, startDate, endDate, page, limit
    const filterParams = {
      lat: coords?.lat,
      lng: coords?.lng,
      radiusKm,
      category,
      skillLevel: skillLevel !== 'All' ? skillLevel : undefined,
      maxBudget,
      startDate,
      endDate,
      page: targetPage,
      limit: 12,
    };

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
                    setRadiusKm(Number(e.target.value));
                    setPage(1);
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
                </select>
              </span>

              {/* Explicit Browser Geolocation Button */}
              {coords ? (
                <button
                  type="button"
                  className="btn btn-sm btn-secondary"
                  onClick={handleClearLocation}
                  title="Clear coordinates filter"
                >
                  <span>📍 Using GPS</span>
                  <span style={{ marginLeft: 4, opacity: 0.7 }}>✕</span>
                </button>
              ) : (
                <button
                  type="button"
                  className="btn btn-sm btn-outline"
                  onClick={handleRequestLocation}
                  disabled={locationStatus === 'requesting'}
                  title="Request foreground browser location (optional)"
                >
                  <Navigation size={13} aria-hidden="true" />
                  <span>
                    {locationStatus === 'requesting' ? 'Locating...' : 'Use Location'}
                  </span>
                </button>
              )}
            </div>
          </div>

          {locationNotice && (
            <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)', margin: 0 }}>
              {locationNotice}
            </p>
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
                ? `Showing published meetups within ${radiusKm} km of selected coordinates`
                : `Showing published meetups within ${radiusKm} km default radius`}
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
          <Link to="/signup" className="btn btn-accent">
            <span>Post an Interest Request</span>
            <ArrowRight size={16} aria-hidden="true" />
          </Link>
        </div>
      </section>
    </div>
  );
}
