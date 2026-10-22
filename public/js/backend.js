// Data access for the app. With a server, reports are shared live between all
// drivers. Without one (the mobile app before a server is set up), everything
// still works but reports stay on this device.
import { ValidationError, normalizeReport, createReport, findDuplicate, applyVote } from './reportRules.js';
import {
  DEFAULT_NOMINATIM_URL, DEFAULT_OSRM_URL, searchUrl, parseSearch, sortByDistance, reverseUrl, parseReverse, routeUrl, parseRoute,
} from './mapServices.js';

export function createBackend({ apiUrl }) {
  return apiUrl === null ? deviceBackend() : serverBackend(apiUrl.replace(/\/$/, ''));
}

async function getJson(url, opts = {}) {
  const res = await fetch(url, {
    ...opts,
    headers: opts.body ? { 'Content-Type': 'application/json' } : undefined,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || data.message || res.statusText || `HTTP ${res.status}`);
  return data;
}

function serverBackend(base) {
  return {
    shared: true,
    listReports: () => getJson(`${base}/api/reports`),
    addReport: (body) => getJson(`${base}/api/reports`, { method: 'POST', body }),
    vote: (id, stillThere) => getJson(`${base}/api/reports/${id}/vote`, { method: 'POST', body: { stillThere } }),
    geocode: (q, near) => getJson(`${base}/api/geocode?q=${encodeURIComponent(q)}&near=${near.join(',')}`),
    reverse: (p) => getJson(`${base}/api/reverse?at=${p.join(',')}`),
    route: (from, to) => getJson(`${base}/api/route?from=${from.join(',')}&to=${to.join(',')}`),
    subscribe(on) {
      const es = new EventSource(`${base}/api/stream`);
      es.onopen = on.open;
      es.onerror = on.error;
      for (const event of ['added', 'updated', 'removed']) es.addEventListener(event, (e) => on[event](JSON.parse(e.data)));
    },
  };
}

function deviceBackend() {
  const KEY = 'sb-reports';
  let reports = [];
  try {
    reports = JSON.parse(localStorage.getItem(KEY)) || [];
  } catch {}
  let on = null;
  const save = () => {
    try {
      localStorage.setItem(KEY, JSON.stringify(reports));
    } catch {}
  };
  const prune = () => {
    const now = Date.now();
    const gone = reports.filter((r) => r.expiresAt <= now);
    if (!gone.length) return;
    reports = reports.filter((r) => r.expiresAt > now);
    save();
    gone.forEach((r) => on?.removed(r));
  };
  const newId = () => globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  const guard = async (fn) => {
    try {
      return await fn();
    } catch (err) {
      throw err instanceof ValidationError ? err : new Error(err.message);
    }
  };
  setInterval(prune, 30_000)?.unref?.(); // unref: don't hold a Node process (tests) open

  return {
    shared: false,
    async listReports() {
      prune();
      return reports;
    },
    addReport: (body) =>
      guard(() => {
        prune();
        const fields = normalizeReport(body);
        const existing = findDuplicate(reports, fields);
        if (existing) {
          applyVote(existing, true, Date.now());
          save();
          on?.updated(existing);
          return { report: existing, merged: true };
        }
        const report = createReport(fields, newId(), Date.now());
        reports.push(report);
        save();
        on?.added(report);
        return { report, merged: false };
      }),
    async vote(id, stillThere) {
      const r = reports.find((x) => x.id === id);
      if (!r) throw new Error('Report not found');
      const removed = applyVote(r, stillThere, Date.now());
      if (removed) reports = reports.filter((x) => x !== r);
      save();
      removed ? on?.removed(r) : on?.updated(r);
      return { report: removed ? null : r, removed };
    },
    geocode: async (q, near) => sortByDistance(parseSearch(await getJson(searchUrl(DEFAULT_NOMINATIM_URL, q))), near),
    reverse: async (p) => parseReverse(await getJson(reverseUrl(DEFAULT_NOMINATIM_URL, p))),
    route: async (from, to) => parseRoute(await getJson(routeUrl(DEFAULT_OSRM_URL, from, to))),
    subscribe(handlers) {
      on = handlers;
      queueMicrotask(() => on.open());
    },
  };
}
