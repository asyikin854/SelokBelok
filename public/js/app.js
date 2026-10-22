import { KL_CENTER, MALAYSIA_BOUNDS, inMalaysia, haversine, cumulativeDistances, nearestOnPolyline, reportsOnRoute, rankRoutes } from './geo.js';
import { REPORT_TYPES } from './reportTypes.js';
import { t, getLang, setLang, speechLang, formatDistance, formatDuration, instruction } from './i18n.js';
import { CONFIG } from './config.js';
import { createBackend } from './backend.js';
import { say, stopSpeaking, keepScreenOn } from './native.js';

const backend = createBackend(CONFIG);

const $ = (id) => document.getElementById(id);
const OFF_ROUTE_M = 60;
const ALERT_AHEAD_M = 800;
const SIM_STEP_M = 12; // metres per simulation tick (~86 km/h at 500 ms ticks)

const state = {
  me: null, // [lat, lng] from GPS
  reports: new Map(), // id -> { data, marker }
  dest: null, // { name, address, lat, lng }
  routes: [], // ranked routes
  selected: 0,
  routeLayers: [],
  nav: null,
};

// ---------- Map ----------

const b = MALAYSIA_BOUNDS;
const map = L.map('map', {
  zoomControl: true,
  maxBounds: [[b.south - 2, b.west - 2], [b.north + 2, b.east + 2]],
  minZoom: 6,
}).setView(KL_CENTER, 12);

L.tileLayer(CONFIG.tileUrl, { maxZoom: 19, attribution: CONFIG.tileAttribution }).addTo(map);

const meMarker = L.marker(KL_CENTER, { icon: L.divIcon({ className: '', html: '<div class="me-marker"></div>', iconSize: [22, 22] }), zIndexOffset: 1000 });
const destMarker = L.marker(KL_CENTER, { icon: L.divIcon({ className: 'dest-marker', html: '📍', iconSize: [32, 32], iconAnchor: [16, 30] }) });
const reportLayer = L.layerGroup().addTo(map);

// ---------- Helpers ----------

let toastTimer;
function toast(msg, ms = 2500) {
  const el = $('toast');
  el.textContent = msg;
  el.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.add('hidden'), ms);
}

const speak = (text) => say(text, speechLang());

const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const origin = () => state.me ?? [map.getCenter().lat, map.getCenter().lng];
const reportLabel = (r) => `${t().types[r.type]}${r.subtype ? ` · ${t().subtypes[r.subtype]}` : ''}`;

function setSheet(open) {
  document.body.classList.toggle('has-sheet', open);
}

// ---------- Location ----------

let firstFix = true;
function onPosition(pos) {
  const p = [pos.coords.latitude, pos.coords.longitude];
  state.me = p;
  meMarker.setLatLng(p).addTo(map);
  if (firstFix && inMalaysia(p)) map.setView(p, 15);
  firstFix = false;
  if (state.nav && !state.nav.simulated) navUpdate(p);
}

if ('geolocation' in navigator) {
  navigator.geolocation.watchPosition(onPosition, (err) => {
    if (err.code === err.PERMISSION_DENIED) toast(t().locationDenied, 4000);
  }, { enableHighAccuracy: true, maximumAge: 2000, timeout: 20000 });
}

$('locate-btn').onclick = () => {
  if (state.me) map.setView(state.me, Math.max(map.getZoom(), 15));
  else toast(t().locating);
};

// ---------- Reports ----------

function reportIcon(r) {
  const def = REPORT_TYPES[r.type];
  return L.divIcon({
    className: '',
    html: `<div class="report-marker" style="background:${def.color}">${def.icon}</div>`,
    iconSize: [36, 36],
    iconAnchor: [18, 18],
    popupAnchor: [0, -18],
  });
}

function reportPopup(r) {
  const mins = Math.floor((Date.now() - r.createdAt) / 60000);
  const el = document.createElement('div');
  el.innerHTML = `
    <div class="popup-title">${REPORT_TYPES[r.type].icon} ${escapeHtml(reportLabel(r))}</div>
    <div class="muted">${t().ago(mins)} · ${t().confirmations(r.up)}</div>
    ${r.note ? `<div style="margin-top:6px">${escapeHtml(r.note)}</div>` : ''}
    <div class="popup-actions">
      <button class="yes">👍 ${t().stillThere}</button>
      <button class="no">👎 ${t().notThere}</button>
    </div>`;
  const vote = (stillThere) => async () => {
    try {
      await backend.vote(r.id, stillThere);
      toast(t().thanks);
    } catch (err) {
      toast(err.message);
    }
    map.closePopup();
  };
  el.querySelector('.yes').onclick = vote(true);
  el.querySelector('.no').onclick = vote(false);
  return el;
}

function upsertReport(r) {
  if (!REPORT_TYPES[r.type]) return;
  const existing = state.reports.get(r.id);
  if (existing) {
    existing.data = r;
    existing.marker.setPopupContent(() => reportPopup(existing.data));
    return;
  }
  const marker = L.marker([r.lat, r.lng], { icon: reportIcon(r) }).addTo(reportLayer);
  const entry = { data: r, marker };
  marker.bindPopup(() => reportPopup(entry.data));
  state.reports.set(r.id, entry);
}

function removeReport(r) {
  const entry = state.reports.get(r.id);
  if (!entry) return;
  reportLayer.removeLayer(entry.marker);
  state.reports.delete(r.id);
}

const allReports = () => [...state.reports.values()].map((e) => e.data);

async function loadReports() {
  try {
    const list = await backend.listReports();
    const ids = new Set(list.map((r) => r.id));
    for (const r of allReports()) if (!ids.has(r.id)) removeReport(r);
    list.forEach(upsertReport);
  } catch {
    /* status pill already shows offline */
  }
}

const statusText = () => (!backend.shared ? t().deviceOnly : $('status').classList.contains('live') ? t().live : t().offline);

function connectStream() {
  const status = $('status');
  backend.subscribe({
    open() {
      status.classList.add('live');
      status.classList.toggle('local', !backend.shared);
      $('status-text').textContent = statusText();
      loadReports(); // catch up on anything missed while disconnected
    },
    error() {
      status.classList.remove('live');
      $('status-text').textContent = statusText();
    },
    added(r) {
      upsertReport(r);
      onReportsChanged();
    },
    updated: upsertReport,
    removed(r) {
      removeReport(r);
      onReportsChanged();
    },
  });
}

// Re-rank routes when the incident picture changes before departure.
function onReportsChanged() {
  if (!state.nav && state.routes.length && !$('route-panel').classList.contains('hidden')) {
    const current = state.routes[state.selected];
    state.routes = rankRoutes(state.routes, allReports());
    state.selected = state.routes.indexOf(current);
    renderRoutes();
  }
}

// ---------- Report sheet ----------

let draft = null;

function openReportSheet() {
  draft = { type: null, subtype: null };
  $('report-where').textContent = state.me ? t().reportHere : t().reportAtCenter;
  const grid = $('report-types');
  grid.innerHTML = '';
  for (const [type, def] of Object.entries(REPORT_TYPES)) {
    const btn = document.createElement('button');
    btn.innerHTML = `<span class="circle" style="background:${def.color}22">${def.icon}</span>${t().types[type]}`;
    btn.onclick = () => chooseType(type, btn);
    grid.appendChild(btn);
  }
  for (const id of ['report-subtypes', 'report-note', 'report-send']) $(id).classList.add('hidden');
  $('report-note').value = '';
  $('report-sheet').classList.remove('hidden');
  setSheet(true);
}

function chooseType(type, btn) {
  draft = { type, subtype: REPORT_TYPES[type].subtypes[0] };
  for (const el of $('report-types').children) el.classList.toggle('active', el === btn);
  const chips = $('report-subtypes');
  chips.innerHTML = '';
  for (const sub of REPORT_TYPES[type].subtypes) {
    const chip = document.createElement('button');
    chip.className = `chip${sub === draft.subtype ? ' active' : ''}`;
    chip.textContent = t().subtypes[sub];
    chip.onclick = () => {
      draft.subtype = sub;
      for (const c of chips.children) c.classList.toggle('active', c === chip);
    };
    chips.appendChild(chip);
  }
  for (const id of ['report-subtypes', 'report-note', 'report-send']) $(id).classList.remove('hidden');
}

function closeReportSheet() {
  $('report-sheet').classList.add('hidden');
  setSheet(!$('route-panel').classList.contains('hidden') || !!state.nav);
}

async function sendReport() {
  if (!draft?.type) return;
  const [lat, lng] = origin();
  $('report-send').disabled = true;
  try {
    const { report, merged } = await backend.addReport({ ...draft, lat, lng, note: $('report-note').value });
    upsertReport(report);
    toast(merged ? t().reportMerged : t().reportSent);
    closeReportSheet();
  } catch (err) {
    toast(`${t().reportFailed}: ${err.message}`);
  } finally {
    $('report-send').disabled = false;
  }
}

$('report-btn').onclick = openReportSheet;
$('report-close').onclick = closeReportSheet;
$('report-send').onclick = sendReport;

// ---------- Search ----------

let searchTimer;
let searchSeq = 0;
$('search-input').addEventListener('input', (e) => {
  clearTimeout(searchTimer);
  const q = e.target.value.trim();
  if (q.length < 2) return $('search-results').classList.add('hidden');
  searchTimer = setTimeout(() => search(q), 350);
});
$('search-input').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') $('search-results').querySelector('li')?.click();
  if (e.key === 'Escape') $('search-results').classList.add('hidden');
});

async function search(q) {
  const seq = ++searchSeq;
  const list = $('search-results');
  list.innerHTML = `<li class="muted">${t().searching}</li>`;
  list.classList.remove('hidden');
  try {
    const [lat, lng] = origin();
    const results = await backend.geocode(q, [lat, lng]);
    if (seq !== searchSeq) return;
    list.innerHTML = results.length ? '' : `<li class="muted">${t().noResults}</li>`;
    for (const r of results) {
      const li = document.createElement('li');
      li.tabIndex = 0;
      const dist = formatDistance(haversine(origin(), [r.lat, r.lng]));
      li.innerHTML = `<div><b>${escapeHtml(r.name)}</b> <span class="muted">· ${dist}</span></div><div class="muted">${escapeHtml(r.address)}</div>`;
      li.onclick = () => {
        list.classList.add('hidden');
        $('search-input').value = r.name;
        $('search-input').blur();
        setDestination(r);
      };
      list.appendChild(li);
    }
  } catch (err) {
    if (seq === searchSeq) list.innerHTML = `<li class="muted">${escapeHtml(err.message)}</li>`;
  }
}

// Long-press (contextmenu) on the map drops a destination pin.
map.on('contextmenu', async (e) => {
  if (state.nav) return;
  const p = { lat: e.latlng.lat, lng: e.latlng.lng, name: `${e.latlng.lat.toFixed(5)}, ${e.latlng.lng.toFixed(5)}`, address: '' };
  setDestination(p);
  try {
    const rev = await backend.reverse([p.lat, p.lng]);
    if (state.dest === p) {
      p.name = rev.name || p.name;
      p.address = rev.address;
      $('dest-name').textContent = p.name;
      $('dest-address').textContent = p.address;
    }
  } catch {}
});

// ---------- Routing ----------

async function setDestination(dest) {
  state.dest = dest;
  destMarker.setLatLng([dest.lat, dest.lng]).addTo(map);
  $('dest-name').textContent = dest.name;
  $('dest-address').textContent = dest.address;
  $('route-list').innerHTML = `<li class="muted">${t().searching}</li>`;
  $('route-panel').classList.remove('hidden');
  $('go-btn').disabled = $('simulate-btn').disabled = true;
  setSheet(true);
  await planRoute(origin());
}

async function planRoute(from) {
  const dest = state.dest;
  try {
    const routes = await backend.route(from, [dest.lat, dest.lng]);
    if (state.dest !== dest) return false;
    state.routes = rankRoutes(routes, allReports());
    state.selected = 0;
    drawRoutes();
    if (!state.nav) {
      renderRoutes();
      map.fitBounds(L.latLngBounds(state.routes[0].coords), { paddingTopLeft: [20, 90], paddingBottomRight: [20, 280] });
    }
    return true;
  } catch (err) {
    if (!state.nav) $('route-list').innerHTML = `<li class="muted">${t().routeFailed}: ${escapeHtml(err.message)}</li>`;
    else toast(t().routeFailed);
    return false;
  }
}

function drawRoutes() {
  state.routeLayers.forEach((l) => map.removeLayer(l));
  state.routeLayers = [];
  const shown = state.nav ? [state.routes[state.selected]] : state.routes;
  // Draw unselected first so the selected route sits on top.
  const order = shown.map((r, i) => i).sort((a, b) => (a === state.selected) - (b === state.selected));
  for (const i of order) {
    const sel = state.nav || i === state.selected;
    const casing = L.polyline(shown[i].coords, { color: sel ? '#0b6f99' : '#7f8c8d', weight: sel ? 10 : 8, opacity: sel ? 1 : 0.6 });
    const line = L.polyline(shown[i].coords, { color: sel ? '#33ccff' : '#bdc3c7', weight: sel ? 6 : 5 });
    if (!state.nav) [casing, line].forEach((l) => l.on('click', () => selectRoute(i)));
    state.routeLayers.push(casing.addTo(map), line.addTo(map));
  }
}

function selectRoute(i) {
  state.selected = i;
  drawRoutes();
  renderRoutes();
}

function renderRoutes() {
  const list = $('route-list');
  list.innerHTML = '';
  state.routes.forEach((r, i) => {
    const li = document.createElement('li');
    li.className = i === state.selected ? 'selected' : '';
    const n = r.incidents.length;
    const icons = [...new Set(r.incidents.map((x) => REPORT_TYPES[x.report.type].icon))].join(' ');
    li.innerHTML = `
      <div class="route-top">
        <div class="title">${formatDuration(r.duration)}${i === 0 ? `<span class="badge">${t().best}</span>` : ''}</div>
        <div class="muted">${formatDistance(r.distance)}</div>
      </div>
      <div class="muted">${r.summary ? `${t().via} ${escapeHtml(r.summary)}` : ''}</div>
      <div class="muted ${n && r.penalty ? 'warn' : ''}">${icons} ${t().incidents(n)}</div>`;
    li.onclick = () => selectRoute(i);
    list.appendChild(li);
  });
  $('go-btn').disabled = $('simulate-btn').disabled = !state.routes.length;
}

function closeRoutePanel() {
  $('route-panel').classList.add('hidden');
  state.routeLayers.forEach((l) => map.removeLayer(l));
  state.routeLayers = [];
  state.routes = [];
  state.dest = null;
  map.removeLayer(destMarker);
  setSheet(false);
}

$('route-close').onclick = closeRoutePanel;
$('go-btn').onclick = () => startNav(false);
$('simulate-btn').onclick = () => startNav(true);

// ---------- Navigation ----------

const ARROWS = {
  left: '⬅', right: '➡', 'slight left': '↖', 'slight right': '↗', 'sharp left': '↙', 'sharp right': '↘',
  straight: '⬆', uturn: '↩',
};
const arrowFor = (step) =>
  step.type === 'arrive' ? '🏁' : step.type.includes('roundabout') || step.type.includes('rotary') ? '⟳' : ARROWS[step.modifier] ?? '⬆';

function prepareNav(route) {
  const cum = cumulativeDistances(route.coords);
  const steps = route.steps.map((s) => ({ ...s, along: nearestOnPolyline(s.location, route.coords, cum).along }));
  return { route, cum, steps, total: cum[cum.length - 1], spoken: new Set(), alerted: new Set(), offRoute: 0, rerouting: false };
}

function startNav(simulated) {
  const route = state.routes[state.selected];
  if (!route) return;
  state.nav = { ...prepareNav(route), simulated, simAlong: 0, simTimer: null };
  state.routes = [route];
  state.selected = 0;
  drawRoutes();
  $('route-panel').classList.add('hidden');
  for (const id of ['nav-banner', 'nav-footer']) $(id).classList.remove('hidden');
  document.body.classList.add('navigating');
  setSheet(true);
  keepScreenOn(true);
  speak(instruction(route.steps[0]));

  if (simulated) {
    state.nav.simTimer = setInterval(() => {
      const nav = state.nav;
      nav.simAlong = Math.min(nav.total, nav.simAlong + SIM_STEP_M);
      navUpdate(pointAlong(nav, nav.simAlong));
    }, 500);
  } else if (state.me) {
    navUpdate(state.me);
  }
}

function pointAlong({ route, cum }, d) {
  let i = cum.findIndex((c) => c >= d);
  if (i <= 0) return route.coords[Math.max(0, i)];
  const f = (d - cum[i - 1]) / (cum[i] - cum[i - 1] || 1);
  const [a, b] = [route.coords[i - 1], route.coords[i]];
  return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
}

function stopNav() {
  const nav = state.nav;
  if (!nav) return;
  clearInterval(nav.simTimer);
  keepScreenOn(false);
  stopSpeaking();
  state.nav = null;
  for (const id of ['nav-banner', 'nav-footer', 'nav-alert']) $(id).classList.add('hidden');
  document.body.classList.remove('navigating');
  if (state.me) meMarker.setLatLng(state.me);
  else map.removeLayer(meMarker);
  closeRoutePanel();
}

$('stop-btn').onclick = stopNav;

async function reroute(p) {
  const nav = state.nav;
  nav.rerouting = true;
  toast(t().rerouting);
  speak(t().rerouting);
  const ok = await planRoute(p);
  if (state.nav !== nav) return;
  if (ok) {
    const fresh = prepareNav(state.routes[state.selected]);
    Object.assign(nav, { ...fresh, simAlong: 0 });
  }
  nav.rerouting = false;
  nav.offRoute = 0;
}

function navUpdate(p) {
  const nav = state.nav;
  if (!nav || nav.arrived) return;
  meMarker.setLatLng(p).addTo(map);
  map.setView(p, Math.max(map.getZoom(), 16), { animate: true });

  const near = nearestOnPolyline(p, nav.route.coords, nav.cum);
  if (near.distance > OFF_ROUTE_M && !nav.simulated) {
    if (++nav.offRoute >= 3 && !nav.rerouting) reroute(p);
    return;
  }
  nav.offRoute = 0;
  const along = near.along;
  const remaining = Math.max(0, nav.total - along);

  if (remaining < 30) {
    $('nav-arrow').textContent = '🏁';
    $('nav-dist').textContent = '';
    $('nav-text').textContent = t().arrived;
    speak(t().arrived);
    clearInterval(nav.simTimer);
    setTimeout(() => state.nav === nav && stopNav(), 4000);
    nav.arrived = true;
    return;
  }

  // Next maneuver.
  const idx = nav.steps.findIndex((s) => s.along > along + 5);
  const step = nav.steps[idx] ?? nav.steps[nav.steps.length - 1];
  const toStep = Math.max(0, step.along - along);
  $('nav-arrow').textContent = arrowFor(step);
  $('nav-dist').textContent = formatDistance(toStep);
  $('nav-text').textContent = instruction(step);
  for (const [limit, key] of [[400, 'far'], [60, 'near']]) {
    const id = `${idx}:${key}`;
    if (toStep <= limit && !nav.spoken.has(id)) {
      nav.spoken.add(id);
      if (key === 'near') nav.spoken.add(`${idx}:far`);
      speak(key === 'far' ? `${t().in(formatDistance(toStep))}, ${instruction(step)}` : instruction(step));
      break;
    }
  }

  // ETA scaled from the routing engine's estimate.
  const secsLeft = nav.route.duration * (remaining / nav.total);
  $('nav-remaining-time').textContent = formatDuration(secsLeft);
  $('nav-remaining-dist').textContent = formatDistance(remaining);
  $('nav-eta').textContent = new Date(Date.now() + secsLeft * 1000).toLocaleTimeString(getLang() === 'ms' ? 'ms-MY' : 'en-MY', { hour: '2-digit', minute: '2-digit' });
  $('nav-eta-label').textContent = t().eta;

  // Hazard alerts ahead on the route, using live reports.
  const ahead = reportsOnRoute(allReports(), nav.route.coords).find((x) => x.along > along && x.along - along <= ALERT_AHEAD_M);
  const alertEl = $('nav-alert');
  if (ahead) {
    const what = `${REPORT_TYPES[ahead.report.type].icon} ${reportLabel(ahead.report)}`;
    alertEl.textContent = t().ahead(what, formatDistance(ahead.along - along));
    alertEl.classList.remove('hidden');
    if (!nav.alerted.has(ahead.report.id)) {
      nav.alerted.add(ahead.report.id);
      speak(t().ahead(reportLabel(ahead.report), formatDistance(ahead.along - along)));
    }
  } else {
    alertEl.classList.add('hidden');
  }
}

// ---------- Language ----------

function applyLang() {
  const s = t();
  document.documentElement.lang = getLang();
  $('search-input').placeholder = s.search;
  $('lang-btn').textContent = getLang() === 'ms' ? 'EN' : 'BM';
  $('report-label').textContent = s.report;
  $('report-title').textContent = s.reportWhat;
  $('report-note').placeholder = s.notePlaceholder;
  $('report-send').textContent = s.send;
  $('go-btn').textContent = s.go;
  $('simulate-btn').textContent = s.simulate;
  $('stop-btn').textContent = s.stop;
  $('status-text').textContent = statusText();
  if (state.routes.length && !state.nav) renderRoutes();
}

$('lang-btn').onclick = () => {
  setLang(getLang() === 'ms' ? 'en' : 'ms');
  applyLang();
};

applyLang();
loadReports();
connectStream();

if ('serviceWorker' in navigator && !globalThis.Capacitor?.isNativePlatform?.() && isSecureContext) {
  navigator.serviceWorker.register('/sw.js').catch(() => {});
}
