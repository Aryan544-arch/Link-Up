/**
 * Location and Geocoding Utilities — LinkUp
 *
 * Provides:
 * - Curated local landmarks & neighborhoods with coordinates for instant autocomplete.
 * - Reverse lookup to format raw coordinates into human-readable area names.
 * - Secure Context checks (for HTTP LAN IP vs localhost/HTTPS).
 * - Safe displayArea cleaning.
 */

export const POPULAR_AREAS = [
  { name: 'Central Park South, New York', displayArea: 'Central Park South, New York', lat: 40.7681, lng: -73.9818 },
  { name: 'Prospect Park / Long Meadow, Brooklyn', displayArea: 'Prospect Park / Long Meadow, Brooklyn', lat: 40.6602, lng: -73.9712 },
  { name: 'Washington Square Park, Greenwich Village', displayArea: 'Washington Square Park, Greenwich Village', lat: 40.7308, lng: -73.9973 },
  { name: 'Bryant Park, Midtown Manhattan', displayArea: 'Bryant Park, Midtown Manhattan', lat: 40.7536, lng: -73.9832 },
  { name: 'Williamsburg Waterfront, Brooklyn', displayArea: 'Williamsburg Waterfront, Brooklyn', lat: 40.7182, lng: -73.9625 },
  { name: 'SoHo / Prince Street, Manhattan', displayArea: 'SoHo / Prince Street, Manhattan', lat: 40.7252, lng: -73.9982 },
  { name: 'Downtown Campus Quad', displayArea: 'Downtown Campus Quad', lat: 40.7484, lng: -73.9851 },
  { name: 'Chelsea / High Line, Manhattan', displayArea: 'Chelsea / High Line, Manhattan', lat: 40.7480, lng: -74.0048 },
  { name: 'Lower East Side, Manhattan', displayArea: 'Lower East Side, Manhattan', lat: 40.7180, lng: -73.9880 },
  { name: 'Financial District, Wall Street', displayArea: 'Financial District, Wall Street', lat: 40.7070, lng: -74.0090 },
  { name: 'Astoria Park, Queens', displayArea: 'Astoria Park, Queens', lat: 40.7780, lng: -73.9230 },
  { name: 'Long Island City, Gantry Plaza', displayArea: 'Long Island City, Gantry Plaza', lat: 40.7460, lng: -73.9580 },
  { name: 'Mission Dolores Park, San Francisco', displayArea: 'Mission Dolores Park, San Francisco', lat: 37.7596, lng: -122.4276 },
  { name: 'Golden Gate Park, San Francisco', displayArea: 'Golden Gate Park, San Francisco', lat: 37.7694, lng: -122.4862 },
  { name: 'Boston Common, Boston', displayArea: 'Boston Common, Boston', lat: 42.3551, lng: -71.0662 },
  { name: 'Millennium Park, Chicago', displayArea: 'Millennium Park, Chicago', lat: 41.8826, lng: -87.6226 },
  { name: 'Balboa Park, San Diego', displayArea: 'Balboa Park, San Diego', lat: 32.7341, lng: -117.1473 },
  { name: 'Zilker Park, Austin', displayArea: 'Zilker Park, Austin', lat: 30.2669, lng: -97.7712 },
  { name: 'Piedmont Park, Atlanta', displayArea: 'Piedmont Park, Atlanta', lat: 33.7850, lng: -84.3733 }
];

/**
 * Searches curated suggestions based on user query string.
 */
export function searchAreaSuggestions(query) {
  if (!query || typeof query !== 'string') return POPULAR_AREAS.slice(0, 5);
  const clean = query.trim().toLowerCase();
  if (!clean) return POPULAR_AREAS.slice(0, 5);

  const matched = POPULAR_AREAS.filter((item) =>
    item.name.toLowerCase().includes(clean) ||
    item.displayArea.toLowerCase().includes(clean)
  );

  return matched.length > 0 ? matched.slice(0, 8) : [];
}

/**
 * Calculates Haversine distance in km between two lat/lng pairs.
 */
function haversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Reverse geocodes coordinates to the closest known neighborhood/landmark.
 * If close (< 10 km), returns "Near [Landmark]".
 * Otherwise formats coordinates cleanly as degrees (e.g. "Area near 40.77° N, 73.98° W").
 */
export function reverseGeocodeApproximate(lat, lng) {
  if (typeof lat !== 'number' || typeof lng !== 'number' || isNaN(lat) || isNaN(lng)) {
    return 'Approximate Meeting Area';
  }

  let closest = null;
  let minDistance = Infinity;

  for (const area of POPULAR_AREAS) {
    const dist = haversineDistance(lat, lng, area.lat, area.lng);
    if (dist < minDistance) {
      minDistance = dist;
      closest = area;
    }
  }

  if (closest && minDistance <= 8) {
    return closest.displayArea;
  }

  if (closest && minDistance <= 25) {
    return `Near ${closest.displayArea}`;
  }

  const latDir = lat >= 0 ? 'N' : 'S';
  const lngDir = lng >= 0 ? 'E' : 'W';
  return `Area (${Math.abs(lat).toFixed(2)}° ${latDir}, ${Math.abs(lng).toFixed(2)}° ${lngDir})`;
}

/**
 * Formats a displayArea value into a friendly human-readable area name.
 * If raw coordinates or "[lng, lat]" string was saved, converts to human-readable landmark.
 */
export function formatDisplayArea(displayArea, coordinates = null) {
  if (typeof displayArea === 'string' && displayArea.trim()) {
    const trimmed = displayArea.trim();
    // Check if string looks like raw coordinates, e.g. "-73.98, 40.76" or "40.76, -73.98" or "[...]"
    const coordMatch = trimmed.match(/^\[?\s*(-?\d+\.?\d*)\s*,\s*(-?\d+\.?\d*)\s*\]?$/);
    if (coordMatch) {
      const p1 = parseFloat(coordMatch[1]);
      const p2 = parseFloat(coordMatch[2]);
      if (!isNaN(p1) && !isNaN(p2)) {
        // Determine which is lat and which is lng
        const [lng, lat] = Math.abs(p1) > 90 ? [p1, p2] : (Math.abs(p2) > 90 ? [p2, p1] : [p1, p2]);
        return reverseGeocodeApproximate(lat, lng);
      }
    }
    return trimmed;
  }

  if (Array.isArray(coordinates) && coordinates.length === 2) {
    const [lng, lat] = coordinates;
    if (typeof lat === 'number' && typeof lng === 'number' && !isNaN(lat) && !isNaN(lng)) {
      return reverseGeocodeApproximate(lat, lng);
    }
  }

  return 'Approximate Meeting Area';
}

/**
 * Checks if the current environment supports secure browser geolocation.
 */
export function isSecureContextSupported() {
  if (typeof window === 'undefined') return true;
  if (typeof window.isSecureContext === 'boolean') {
    return window.isSecureContext;
  }
  // Localhost is always secure
  const host = window.location?.hostname || '';
  return host === 'localhost' || host === '127.0.0.1' || window.location?.protocol === 'https:';
}
