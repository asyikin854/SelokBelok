// Request builders and response parsers for Nominatim (search) and OSRM
// (routing). Used by the server's cached proxy, and by the app directly when
// it runs without a server.
import { MALAYSIA_BOUNDS, haversine } from './geo.js';

export const DEFAULT_NOMINATIM_URL = 'https://nominatim.openstreetmap.org';
export const DEFAULT_OSRM_URL = 'https://router.project-osrm.org';

export function searchUrl(base, q) {
  const b = MALAYSIA_BOUNDS;
  const params = new URLSearchParams({
    q,
    format: 'jsonv2',
    countrycodes: 'my',
    limit: '8',
    addressdetails: '0',
    'accept-language': 'ms,en',
    viewbox: `${b.west},${b.north},${b.east},${b.south}`,
  });
  return `${base}/search?${params}`;
}

export function parseSearch(raw) {
  const results = [];
  for (const p of raw) {
    const r = { name: p.name || p.display_name.split(',')[0], address: p.display_name, lat: Number(p.lat), lng: Number(p.lon), kind: p.type };
    // Nominatim often returns e.g. a station and its stop as separate hits.
    if (!results.some((x) => x.name === r.name && haversine([x.lat, x.lng], [r.lat, r.lng]) < 200)) results.push(r);
  }
  return results;
}

export function sortByDistance(results, near) {
  if (!near) return results;
  const [lat, lng] = near;
  const d = (r) => (r.lat - lat) ** 2 + (r.lng - lng) ** 2;
  return [...results].sort((a, b) => d(a) - d(b));
}

export function reverseUrl(base, [lat, lng]) {
  const params = new URLSearchParams({ lat, lon: lng, format: 'jsonv2', zoom: '17', 'accept-language': 'ms,en' });
  return `${base}/reverse?${params}`;
}

export const parseReverse = (p) => ({ name: p.name || p.display_name?.split(',')[0] || '', address: p.display_name || '' });

export function routeUrl(base, from, to) {
  const params = new URLSearchParams({ alternatives: '3', steps: 'true', geometries: 'geojson', overview: 'full' });
  return `${base}/route/v1/driving/${from[1]},${from[0]};${to[1]},${to[0]}?${params}`;
}

// Returns up to 3 driving routes as { distance, duration, coords: [[lat,lng]], steps },
// or throws with OSRM's message when there is no route.
export function parseRoute(raw) {
  if (raw.code !== 'Ok') throw new Error(raw.message || raw.code || 'No route found');
  return raw.routes.map((r) => ({
    distance: r.distance,
    duration: r.duration,
    summary: r.legs.map((l) => l.summary).filter(Boolean).join(', '),
    coords: r.geometry.coordinates.map(([lng, lat]) => [lat, lng]),
    steps: r.legs.flatMap((l) =>
      l.steps.map((s) => ({
        type: s.maneuver.type,
        modifier: s.maneuver.modifier ?? null,
        exit: s.maneuver.exit ?? null,
        name: s.name || s.ref || '',
        ref: s.ref || '',
        distance: s.distance,
        duration: s.duration,
        location: [s.maneuver.location[1], s.maneuver.location[0]],
      })),
    ),
  }));
}
