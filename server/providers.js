// Thin, cached proxies for third-party map services. Proxying lets us send a
// proper User-Agent (required by the Nominatim usage policy), keep searches
// scoped to Malaysia, and swap in self-hosted OSRM / Nominatim via env vars.
import { inMalaysia } from '../public/js/geo.js';
import {
  DEFAULT_NOMINATIM_URL, DEFAULT_OSRM_URL, searchUrl, parseSearch, sortByDistance, reverseUrl, parseReverse, routeUrl, parseRoute,
} from '../public/js/mapServices.js';

const NOMINATIM_URL = process.env.NOMINATIM_URL || DEFAULT_NOMINATIM_URL;
const OSRM_URL = process.env.OSRM_URL || DEFAULT_OSRM_URL;
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
  const url = searchUrl(NOMINATIM_URL, q);
  let results = geocodeCache.get(url);
  if (!results) {
    results = parseSearch(await fetchJson(url));
    geocodeCache.set(url, results);
  }
  return sortByDistance(results, near);
}

export async function reverseGeocode([lat, lng]) {
  const key = `rev:${Number(lat).toFixed(4)},${Number(lng).toFixed(4)}`;
  const cached = geocodeCache.get(key);
  if (cached) return cached;
  const result = parseReverse(await fetchJson(reverseUrl(NOMINATIM_URL, [lat, lng])));
  geocodeCache.set(key, result);
  return result;
}

export async function route(from, to) {
  for (const p of [from, to]) {
    if (!inMalaysia(p)) throw new ProviderError('Route endpoints must be in Malaysia', 400);
  }
  const key = [...from, ...to].map((n) => n.toFixed(5)).join(',');
  const cached = routeCache.get(key);
  if (cached) return cached;
  let routes;
  try {
    routes = parseRoute(await fetchJson(routeUrl(OSRM_URL, from, to)));
  } catch (err) {
    throw err instanceof ProviderError ? err : new ProviderError(err.message, 404);
  }
  routeCache.set(key, routes);
  return routes;
}
