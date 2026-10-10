import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { MapPin, Compass, PlusCircle, Calendar, Bell, Menu, X, User, LogIn } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

export default function Navbar() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const location = useLocation();
  const { user, isAuthenticated, logout } = useAuth();

  // Close mobile drawer on route change
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [location.pathname]);

  // Close mobile drawer on Escape key press
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && mobileMenuOpen) {
        setMobileMenuOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [mobileMenuOpen]);

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
        <div className="navbar-actions-desktop">
          <button 
            type="button" 
            className="nav-icon-btn" 
            aria-label="Notifications" 
            title="In-app Notifications"
          >
            <Bell size={18} aria-hidden="true" />
          </button>
          
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
