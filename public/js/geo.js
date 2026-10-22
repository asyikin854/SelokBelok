// Pure geometry + routing helpers. Shared by the browser and the server (and tests).
// Coordinates are [lat, lng] throughout.

export const MALAYSIA_BOUNDS = { south: 0.8, west: 99.5, north: 7.5, east: 119.5 };
export const KL_CENTER = [3.139, 101.6869];

const R = 6371000;
const rad = (d) => (d * Math.PI) / 180;

export function inMalaysia([lat, lng]) {
  const b = MALAYSIA_BOUNDS;
  return lat >= b.south && lat <= b.north && lng >= b.west && lng <= b.east;
}

export function haversine([lat1, lng1], [lat2, lng2]) {
  const dLat = rad(lat2 - lat1);
  const dLng = rad(lng2 - lng1);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

// Distance from p to segment a-b, using a local equirectangular projection
// (accurate to well under a metre at the segment lengths routes produce).
// Returns { distance, t } where t in [0,1] is the projection along a-b.
export function distanceToSegment(p, a, b) {
  const k = Math.cos(rad(p[0]));
  const ax = (a[1] - p[1]) * k, ay = a[0] - p[0];
  const bx = (b[1] - p[1]) * k, by = b[0] - p[0];
  const dx = bx - ax, dy = by - ay;
  const len2 = dx * dx + dy * dy;
  let t = len2 === 0 ? 0 : -(ax * dx + ay * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  const cx = ax + t * dx, cy = ay + t * dy;
  return { distance: rad(Math.sqrt(cx * cx + cy * cy)) * R, t };
}

// Cumulative distance (m) at each vertex of a polyline.
export function cumulativeDistances(coords) {
  const out = [0];
  for (let i = 1; i < coords.length; i++) out.push(out[i - 1] + haversine(coords[i - 1], coords[i]));
  return out;
}

// Nearest point on a polyline. `along` is the distance from the start of the
// line to that point. Pass precomputed cumulative distances to avoid O(n) work.
export function nearestOnPolyline(p, coords, cum = cumulativeDistances(coords)) {
  let best = { distance: Infinity, index: 0, along: 0 };
  for (let i = 0; i < coords.length - 1; i++) {
    const { distance, t } = distanceToSegment(p, coords[i], coords[i + 1]);
    if (distance < best.distance) {
      best = { distance, index: i, along: cum[i] + t * (cum[i + 1] - cum[i]) };
    }
  }
  if (coords.length === 1) best = { distance: haversine(p, coords[0]), index: 0, along: 0 };
  return best;
}

// Reports lying on a route, ordered by how far along the route they are.
export function reportsOnRoute(reports, coords, threshold = 60) {
  const cum = cumulativeDistances(coords);
  return reports
    .map((r) => ({ report: r, ...nearestOnPolyline([r.lat, r.lng], coords, cum) }))
    .filter((x) => x.distance <= threshold)
    .sort((a, b) => a.along - b.along);
}

// Rough delay (seconds) a report adds to a route. Police and cameras cost
// nothing: they are things to be warned about, not reasons to detour.
const PENALTY = {
  jam: { moderate: 120, heavy: 360, standstill: 720 },
  accident: { minor: 240, major: 600 },
  hazard: { default: 30 },
  flood: { default: 1800 },
  closure: { default: 7200 },
};

export function reportPenalty(r) {
  const byType = PENALTY[r.type];
  if (!byType) return 0;
  return byType[r.subtype] ?? byType.default ?? Object.values(byType)[0];
}

// Rank routes (each { duration, coords }) by duration plus incident penalties.
export function rankRoutes(routes, reports) {
  return routes
    .map((route) => {
      const incidents = reportsOnRoute(reports, route.coords);
      const penalty = incidents.reduce((s, x) => s + reportPenalty(x.report), 0);
      return { ...route, incidents, penalty, score: route.duration + penalty };
    })
    .sort((a, b) => a.score - b.score);
}
