// Thin, cached proxies for third-party map services. Proxying lets us send a
// proper User-Agent (required by the Nominatim usage policy), keep searches
// scoped to Malaysia, and swap in self-hosted OSRM / Nominatim via env vars.
import { MALAYSIA_BOUNDS, inMalaysia, haversine } from '../public/js/geo.js';

const NOMINATIM_URL = process.env.NOMINATIM_URL || 'https://nominatim.openstreetmap.org';
const OSRM_URL = process.env.OSRM_URL || 'https://router.project-osrm.org';
const USER_AGENT = process.env.USER_AGENT || 'SelokBelok/0.1 (https://github.com/asyikin854/SelokBelok)';

export class ProviderError extends Error {
  constructor(message, status = 502) {
    super(message);
    this.status = status;
  }
}

class Cache {
  constructor(max = 500, ttlMs = 10 * 60_000) {
    Object.assign(this, { max, ttlMs, map: new Map() });
  }
  get(key) {
    const hit = this.map.get(key);
    if (!hit || hit.expires < Date.now()) return undefined;
    return hit.value;
  }
  set(key, value) {
    if (this.map.size >= this.max) this.map.delete(this.map.keys().next().value);
    this.map.set(key, { value, expires: Date.now() + this.ttlMs });
  }
}

const geocodeCache = new Cache(1000, 24 * 60 * 60_000);
const routeCache = new Cache(300, 2 * 60_000);

async function fetchJson(url) {
  let res;
  try {
    res = await fetch(url, { headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' }, signal: AbortSignal.timeout(10_000) });
  } catch (err) {
    throw new ProviderError(`Upstream unreachable: ${err.message}`);
  }
  if (!res.ok) throw new ProviderError(`Upstream returned ${res.status}`);
  return res.json();
}

export async function geocode(q, near) {
  q = String(q ?? '').trim();
  if (q.length < 2) return [];
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
  const key = params.toString();
  let results = geocodeCache.get(key);
  if (!results) {
    const raw = await fetchJson(`${NOMINATIM_URL}/search?${params}`);
    results = [];
    for (const p of raw) {
      const r = { name: p.name || p.display_name.split(',')[0], address: p.display_name, lat: Number(p.lat), lng: Number(p.lon), kind: p.type };
      // Nominatim often returns e.g. a station and its stop as separate hits.
      if (!results.some((x) => x.name === r.name && haversine([x.lat, x.lng], [r.lat, r.lng]) < 200)) results.push(r);
    }
    geocodeCache.set(key, results);
  }
  if (near) {
    const [lat, lng] = near;
    const d = (r) => (r.lat - lat) ** 2 + (r.lng - lng) ** 2;
    results = [...results].sort((a, b) => d(a) - d(b));
  }
  return results;
}

export async function reverseGeocode([lat, lng]) {
  const params = new URLSearchParams({ lat, lon: lng, format: 'jsonv2', zoom: '17', 'accept-language': 'ms,en' });
  const key = `rev:${Number(lat).toFixed(4)},${Number(lng).toFixed(4)}`;
  const cached = geocodeCache.get(key);
  if (cached) return cached;
  const p = await fetchJson(`${NOMINATIM_URL}/reverse?${params}`);
  const result = { name: p.name || p.display_name?.split(',')[0] || '', address: p.display_name || '' };
  geocodeCache.set(key, result);
  return result;
}

// Returns up to 3 driving routes as { distance, duration, coords: [[lat,lng]], steps }.
export async function route(from, to) {
  for (const p of [from, to]) {
    if (!inMalaysia(p)) throw new ProviderError('Route endpoints must be in Malaysia', 400);
  }
  const key = [...from, ...to].map((n) => n.toFixed(5)).join(',');
  const cached = routeCache.get(key);
  if (cached) return cached;

  const path = `${from[1]},${from[0]};${to[1]},${to[0]}`;
  const params = new URLSearchParams({ alternatives: '3', steps: 'true', geometries: 'geojson', overview: 'full' });
  const raw = await fetchJson(`${OSRM_URL}/route/v1/driving/${path}?${params}`);
  if (raw.code !== 'Ok') throw new ProviderError(raw.message || raw.code || 'No route found', 404);

  const routes = raw.routes.map((r) => ({
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
  routeCache.set(key, routes);
  return routes;
}
