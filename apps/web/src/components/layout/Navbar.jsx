import React, { useState, useEffect, useCallback } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { MapPin, Compass, PlusCircle, Calendar, Bell, Menu, X, User, LogIn } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import apiClient from '../../lib/api';

export default function Navbar() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const { user, isAuthenticated, logout } = useAuth();

  // Notification States
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifications, setNotifications] = useState([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [loadingNotifications, setLoadingNotifications] = useState(false);

  // Poll unread count when authenticated
  const fetchUnreadCount = useCallback(async () => {
    if (!isAuthenticated) {
      setUnreadCount(0);
      return;
    }
    try {
      const res = await apiClient.get('/api/notifications/unread-count');
      const count = res.data?.data?.unreadCount || 0;
      setUnreadCount(count);
    } catch {
      // Silently ignore if unauthenticated or network drops
    }
  }, [isAuthenticated]);

  const fetchNotificationsList = useCallback(async () => {
    if (!isAuthenticated) return;
    setLoadingNotifications(true);
    try {
      const res = await apiClient.get('/api/notifications?limit=20');
      const list = Array.isArray(res.data?.data) ? res.data.data : [];
      setNotifications(list);
    } catch {
      // Ignore
    } finally {
      setLoadingNotifications(false);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    if (isAuthenticated) {
      fetchUnreadCount();
      const interval = setInterval(fetchUnreadCount, 30000);
      return () => clearInterval(interval);
    } else {
      setUnreadCount(0);
      setNotifications([]);
      setShowNotifications(false);
    }
  }, [isAuthenticated, fetchUnreadCount]);

  const handleToggleNotifications = () => {
    const nextState = !showNotifications;
    setShowNotifications(nextState);
    if (nextState) {
      fetchNotificationsList();
    }
  };

  const handleMarkNotificationRead = async (id) => {
    try {
      await apiClient.patch(`/api/notifications/${encodeURIComponent(id)}/read`);
      setNotifications((prev) =>
        prev.map((n) => (n.id === id || n._id === id) ? { ...n, isRead: true, readAt: new Date().toISOString() } : n)
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));
    } catch {
      // Ignore
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await apiClient.patch('/api/notifications/read-all');
      setNotifications((prev) =>
        prev.map((n) => ({ ...n, isRead: true, readAt: new Date().toISOString() }))
      );
      setUnreadCount(0);
    } catch {
      // Ignore
    }
  };

  const handleNotificationClick = (n) => {
    handleMarkNotificationRead(n.id || n._id);
    setShowNotifications(false);
    if (n.relatedResourceId && (n.relatedResourceType === 'activity' || n.relatedResourceType === 'contest')) {
      navigate(`/activities/${n.relatedResourceId}`);
    }
  };

  // Close mobile drawer on route change
  useEffect(() => {
    setMobileMenuOpen(false);
    setShowNotifications(false);
  }, [location.pathname]);

  // Close mobile drawer on Escape key press
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        if (showNotifications) setShowNotifications(false);
        if (mobileMenuOpen) setMobileMenuOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [mobileMenuOpen, showNotifications]);

  const navLinks = [
    { label: 'Discover', path: '/', icon: Compass },
    { label: 'Create Activity', path: '/create', icon: PlusCircle },
    { label: 'My Plans', path: '/plans', icon: Calendar },
  ];

  return (
    <header className="navbar-root">
      <div className="container navbar-container">
        {/* Brand / Logo */}
        <Link to="/" className="navbar-brand" aria-label="LinkUp Home">
          <img 
            src="/linkup-logo.svg" 
            alt="LinkUp Logo" 
            className="navbar-brand-logo" 
            width="36" 
            height="36" 
          />
          <div className="navbar-brand-text">
            <span className="brand-name">LinkUp</span>
            <span className="brand-tag">meetups</span>
          </div>
        </Link>

        {/* Discovery Radius / Location Indicator (PRD: 3 km default, manual fallback) */}
        <div 
          className="navbar-location-pill" 
          role="status" 
          aria-label="Discovery Area: Default radius is 3 km, approximate manual fallback"
          title="Default discovery radius: 3 km (Browser location is optional; manual area fallback enabled)"
        >
          <MapPin size={14} className="location-pin-icon" aria-hidden="true" />
          <span>Within <strong>3 km</strong></span>
        </div>

        {/* Desktop Nav Links */}
        <nav className="navbar-links-desktop" aria-label="Main Navigation">
          {navLinks.map((link) => {
            const Icon = link.icon;
            const isActive = location.pathname === link.path;
            return (
              <Link
                key={link.path}
                to={link.path}
                className={`nav-link ${isActive ? 'active' : ''}`}
                aria-current={isActive ? 'page' : undefined}
              >
                <Icon size={16} aria-hidden="true" />
                <span>{link.label}</span>
              </Link>
            );
          })}
        </nav>

        {/* Header Right Actions */}
        <div className="navbar-actions-desktop" style={{ position: 'relative' }}>
          <button 
            type="button" 
            className="nav-icon-btn" 
            aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ''}`}
            title="In-app Notifications"
            onClick={handleToggleNotifications}
            style={{ position: 'relative' }}
          >
            <Bell size={18} aria-hidden="true" />
            {unreadCount > 0 && (
              <span
                style={{
                  position: 'absolute',
                  top: '-4px',
                  right: '-4px',
                  backgroundColor: '#dc2626',
                  color: '#ffffff',
                  fontSize: '10px',
                  fontWeight: 700,
                  borderRadius: '10px',
                  padding: '1px 5px',
                  minWidth: '16px',
                  textAlign: 'center',
                  lineHeight: '14px',
                }}
              >
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>

          {/* Notifications Dropdown Popover */}
          {showNotifications && (
            <div
              style={{
                position: 'absolute',
                top: 'calc(100% + 8px)',
                right: 0,
                width: '340px',
                maxHeight: '420px',
                background: 'var(--bg-surface)',
                borderRadius: 'var(--radius-lg)',
                border: '1px solid var(--border-color)',
                boxShadow: 'var(--shadow-xl)',
                zIndex: 1000,
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  padding: 'var(--space-3) var(--space-4)',
                  borderBottom: '1px solid var(--border-color)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  backgroundColor: 'var(--bg-surface-subtle)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                  <Bell size={15} color="var(--color-forest-green)" />
                  <span style={{ fontWeight: 700, fontSize: 'var(--font-size-sm)' }}>
                    Notifications {unreadCount > 0 && `(${unreadCount})`}
                  </span>
                </div>
                {unreadCount > 0 && (
                  <button
                    type="button"
                    className="btn btn-ghost btn-xs"
                    onClick={handleMarkAllRead}
                    style={{ fontSize: '11px' }}
                  >
                    Mark all read
                  </button>
                )}
              </div>

              <div style={{ overflowY: 'auto', maxHeight: '340px', padding: 'var(--space-2)' }}>
                {loadingNotifications && notifications.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: 'var(--space-6)', color: 'var(--text-muted)', fontSize: 'var(--font-size-xs)' }}>
                    Loading notifications...
                  </div>
                ) : notifications.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: 'var(--space-6)', color: 'var(--text-muted)' }}>
                    <Bell size={24} style={{ opacity: 0.3, margin: '0 auto var(--space-2)' }} />
                    <p style={{ margin: 0, fontSize: 'var(--font-size-xs)' }}>
                      No notifications yet.
                    </p>
                    <p style={{ margin: '4px 0 0 0', fontSize: '11px', opacity: 0.7 }}>
                      Updates on your activities and requests will appear here.
                    </p>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
                    {notifications.map((n) => {
                      const isUnread = !n.isRead && !n.readAt;
                      return (
                        <div
                          key={n.id || n._id}
                          style={{
                            padding: 'var(--space-2) var(--space-3)',
                            borderRadius: 'var(--radius-sm)',
                            backgroundColor: isUnread ? 'var(--bg-surface-subtle)' : 'transparent',
                            borderLeft: isUnread ? '3px solid var(--color-forest-green)' : '3px solid transparent',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '2px',
                            cursor: 'pointer',
                          }}
                          onClick={() => handleNotificationClick(n)}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontWeight: isUnread ? 700 : 500, fontSize: 'var(--font-size-xs)' }}>
                              {n.title || 'Notification'}
                            </span>
                            {n.createdAt && (
                              <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                                {new Date(n.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                              </span>
                            )}
                          </div>
                          {n.message && (
                            <p style={{ margin: 0, fontSize: '11px', color: 'var(--text-secondary)', lineHeight: '1.3' }}>
                              {n.message}
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}
          
          {isAuthenticated && user ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span className="badge badge-sage">
                <User size={12} aria-hidden="true" />
                <span>{user.displayName || 'Profile'}</span>
              </span>
              <button 
                type="button" 
                className="btn btn-outline btn-sm"
                onClick={logout}
              >
                <span>Log out</span>
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Link to="/login" className="btn btn-ghost btn-sm">
                <span>Sign In</span>
              </Link>
              <Link to="/signup" className="btn btn-primary btn-sm">
                <span>Join LinkUp</span>
              </Link>
            </div>
          )}
        </div>

        {/* Mobile Menu Toggle Button */}
        <button
          type="button"
          className="mobile-menu-toggle"
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          aria-expanded={mobileMenuOpen}
          aria-controls="mobile-navigation-drawer"
          aria-label={mobileMenuOpen ? "Close navigation menu" : "Open navigation menu"}
        >
          {mobileMenuOpen ? <X size={22} aria-hidden="true" /> : <Menu size={22} aria-hidden="true" />}
        </button>
      </div>

      {/* Accessible Mobile Drawer & Backdrop */}
      {mobileMenuOpen && (
        <>
          <div 
            className="drawer-backdrop" 
            onClick={() => setMobileMenuOpen(false)} 
            aria-hidden="true"
          />
          <div 
            id="mobile-navigation-drawer" 
            className="mobile-nav-drawer" 
            role="region" 
            aria-label="Mobile Navigation Drawer"
          >
            <div className="container mobile-drawer-content">
              <div className="mobile-location-badge" role="status">
                <MapPin size={15} aria-hidden="true" />
                <span>Default Radius: <strong>3 km</strong> · Manual area fallback enabled</span>
              </div>
              <nav aria-label="Mobile Navigation Links">
                {navLinks.map((link) => {
                  const Icon = link.icon;
                  const isActive = location.pathname === link.path;
                  return (
                    <Link
                      key={link.path}
                      to={link.path}
                      className={`mobile-nav-link ${isActive ? 'active' : ''}`}
                      onClick={() => setMobileMenuOpen(false)}
                      aria-current={isActive ? 'page' : undefined}
                    >
                      <Icon size={18} aria-hidden="true" />
                      <span>{link.label}</span>
                    </Link>
                  );
                })}
              </nav>
              <div style={{ marginTop: '0.5rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {isAuthenticated && user ? (
                  <>
                    <div className="badge badge-sage" style={{ justifyContent: 'center', padding: '0.5rem' }}>
                      Signed in as {user.displayName || user.email || 'User'}
                    </div>
                    <button 
                      type="button" 
                      className="btn btn-outline" 
                      style={{ width: '100%' }}
                      onClick={logout}
                    >
                      <span>Log out</span>
                    </button>
                  </>
                ) : (
                  <>
                    <Link 
                      to="/login" 
                      className="btn btn-outline" 
                      style={{ width: '100%' }}
                      onClick={() => setMobileMenuOpen(false)}
                    >
                      <LogIn size={16} aria-hidden="true" />
                      <span>Sign In</span>
                    </Link>
                    <Link 
                      to="/signup" 
                      className="btn btn-primary" 
                      style={{ width: '100%' }}
                      onClick={() => setMobileMenuOpen(false)}
                    >
                      <span>Join LinkUp</span>
                    </Link>
                  </>
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </header>
  );
}
