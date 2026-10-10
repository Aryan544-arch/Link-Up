import React from 'react';
import { Shield, MapPin, Sparkles, Lock } from 'lucide-react';

export default function Footer() {
  return (
    <footer className="footer-root">
      <div className="container footer-container">
        {/* Brand Column */}
        <div className="footer-brand-col">
          <div className="footer-brand">
            <span className="footer-brand-title">LinkUp</span>
            <span className="footer-tagline">“Find your people. Make it happen.”</span>
          </div>
          <p className="footer-desc">
            A location-aware activity platform connecting young adults and students with real-world meetups nearby within 3 km.
          </p>
        </div>

        {/* Platform Principles */}
        <div className="footer-links-col">
          <h3 className="footer-heading">Platform Rules</h3>
          <ul className="footer-links-list">
            <li>
              <span className="footer-badge-item">
                <MapPin size={14} aria-hidden="true" />
                <span>3 km Default Discovery Radius</span>
              </span>
            </li>
            <li>
              <span className="footer-badge-item">
                <Sparkles size={14} aria-hidden="true" />
                <span>Demand-First Deterministic Matching</span>
              </span>
            </li>
            <li>
              <span>No surprise commitments or auto-booking</span>
            </li>
          </ul>
        </div>

        {/* Privacy by Design */}
        <div className="footer-links-col">
          <h3 className="footer-heading">Privacy by Design</h3>
          <ul className="footer-links-list">
            <li>
              <span className="footer-badge-item">
                <Shield size={14} aria-hidden="true" />
                <span>Zero Private Coordinate Exposure</span>
              </span>
            </li>
            <li>
              <span className="footer-badge-item">
                <Lock size={14} aria-hidden="true" />
                <span>Optional Geolocation &amp; Manual Area</span>
              </span>
            </li>
            <li>
              <span>Session-authenticated ownership checks</span>
            </li>
          </ul>
        </div>
      </div>

      <div className="container footer-bottom">
        <p className="footer-copy">
          © {new Date().getFullYear()} LinkUp. Built for the Hackathon MVP following MEETUP_Pulse_PRD.md. Real data, real people.
        </p>
      </div>
    </footer>
  );
}
