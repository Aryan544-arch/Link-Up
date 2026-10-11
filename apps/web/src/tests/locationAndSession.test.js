import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  POPULAR_AREAS,
  searchAreaSuggestions,
  reverseGeocodeApproximate,
  formatDisplayArea,
  isSecureContextSupported
} from '../lib/locationUtils.js';
import { resolveApiBaseUrl } from '../lib/api.js';

describe('MEETUP Pulse — Location Utilities & Client Base URL Suite', () => {
  describe('Dynamic API Base URL Resolution (LAN IP & Localhost)', () => {
    it('defaults to http://localhost:3000 when no window is present', () => {
      // In node environment without window
      const url = resolveApiBaseUrl();
      assert.ok(url.startsWith('http://'), 'Must return an http URL');
      assert.ok(url.includes(':3000'), 'Must point to port 3000');
    });

    it('resolves LAN IP origin dynamically when window is defined', () => {
      const originalWindow = globalThis.window;
      try {
        globalThis.window = {
          location: {
            hostname: '10.162.61.69',
            port: '5173',
            protocol: 'http:'
          }
        };

        const resolved = resolveApiBaseUrl();
        assert.equal(resolved, 'http://10.162.61.69:3000');
      } finally {
        globalThis.window = originalWindow;
      }
    });

    it('resolves localhost origin dynamically when window is defined on localhost', () => {
      const originalWindow = globalThis.window;
      try {
        globalThis.window = {
          location: {
            hostname: 'localhost',
            port: '5175',
            protocol: 'http:'
          }
        };

        const resolved = resolveApiBaseUrl();
        assert.equal(resolved, 'http://localhost:3000');
      } finally {
        globalThis.window = originalWindow;
      }
    });
  });

  describe('Search Area Suggestions', () => {
    it('returns default top suggestions on empty or missing query', () => {
      const emptyResult = searchAreaSuggestions('');
      assert.ok(Array.isArray(emptyResult));
      assert.equal(emptyResult.length, 5);

      const nullResult = searchAreaSuggestions(null);
      assert.equal(nullResult.length, 5);
    });

    it('filters areas by query case-insensitively', () => {
      const centralPark = searchAreaSuggestions('central park');
      assert.ok(centralPark.length >= 1);
      assert.ok(centralPark[0].name.toLowerCase().includes('central park'));

      const brooklyn = searchAreaSuggestions('BROOKLYN');
      assert.ok(brooklyn.length >= 1);
      assert.ok(brooklyn.some((item) => item.name.toLowerCase().includes('brooklyn')));
    });

    it('returns empty array when no matches are found', () => {
      const noMatch = searchAreaSuggestions('xyznonexistentplace999');
      assert.deepEqual(noMatch, []);
    });
  });

  describe('Reverse Geocoding & Coordinate Formatting', () => {
    it('returns exact neighborhood when within 8km of a known landmark', () => {
      // Central Park coordinates: 40.7681, -73.9818
      const result = reverseGeocodeApproximate(40.7681, -73.9818);
      assert.equal(result, 'Central Park South, New York');
    });

    it('returns "Near [Area]" when within 8-25km of a landmark', () => {
      // Point ~15km away from Central Park
      const result = reverseGeocodeApproximate(40.85, -73.90);
      assert.ok(result.startsWith('Near '), `Expected "Near ...", got ${result}`);
    });

    it('returns directional coordinates when far from known landmarks', () => {
      // Faraway coordinates (e.g. Honolulu: 21.3069, -157.8583)
      const result = reverseGeocodeApproximate(21.3069, -157.8583);
      assert.ok(result.includes('21.31° N'), `Expected formatted degrees, got ${result}`);
      assert.ok(result.includes('157.86° W'), `Expected formatted degrees, got ${result}`);
    });

    it('returns fallback for invalid coordinates', () => {
      assert.equal(reverseGeocodeApproximate(NaN, null), 'Approximate Meeting Area');
    });
  });

  describe('formatDisplayArea Helper', () => {
    it('preserves clean human-readable string names', () => {
      assert.equal(formatDisplayArea('Greenwich Village, Manhattan'), 'Greenwich Village, Manhattan');
    });

    it('parses raw coordinate string and converts to human-readable landmark', () => {
      // Raw coordinate string: "[-73.9818, 40.7681]"
      const converted = formatDisplayArea('[-73.9818, 40.7681]');
      assert.equal(converted, 'Central Park South, New York');
    });

    it('formats from coordinates array [lng, lat] when displayArea is empty', () => {
      const converted = formatDisplayArea('', [-73.9818, 40.7681]);
      assert.equal(converted, 'Central Park South, New York');
    });

    it('returns "Approximate Meeting Area" when both displayArea and coordinates are missing', () => {
      assert.equal(formatDisplayArea('', null), 'Approximate Meeting Area');
      assert.equal(formatDisplayArea(null, undefined), 'Approximate Meeting Area');
    });
  });

  describe('isSecureContextSupported Check', () => {
    it('returns true on localhost or 127.0.0.1', () => {
      const originalWindow = globalThis.window;
      try {
        globalThis.window = {
          location: { hostname: 'localhost', protocol: 'http:' }
        };
        assert.equal(isSecureContextSupported(), true);

        globalThis.window = {
          location: { hostname: '127.0.0.1', protocol: 'http:' }
        };
        assert.equal(isSecureContextSupported(), true);
      } finally {
        globalThis.window = originalWindow;
      }
    });

    it('detects insecure context on HTTP LAN IP', () => {
      const originalWindow = globalThis.window;
      try {
        globalThis.window = {
          isSecureContext: false,
          location: { hostname: '10.162.61.69', protocol: 'http:' }
        };
        assert.equal(isSecureContextSupported(), false);
      } finally {
        globalThis.window = originalWindow;
      }
    });
  });
});
