# SelokBelok 🚗

Community-driven navigation for Malaysia, built the way Waze works. Drivers report jams, police, SJR roadblocks, floods, potholes and other hazards. Everyone sees the reports live, and routes steer around trouble.

*Selok-belok* means "the ins and outs" (of a place).

## Features

- **Live map of community reports**: Kesesakan (jam), Polis (including SJR roadblocks), Kemalangan (accident), Bahaya (potholes, objects, oil spills, animals), Banjir (flood), Jalan ditutup (closures, landslides) and Kamera (speed, red light, AWAS). New reports reach every open client instantly over Server-Sent Events.
- **Crowd verification**: other drivers tap 👍 *Masih ada* to extend a report or 👎 *Tiada lagi* to remove it. A duplicate report within 100 m confirms the existing one instead of adding a copy. Each type expires on its own schedule: a jam after 30 minutes, a pothole after 7 days.
- **Incident-aware routing**: you get up to 3 alternatives, ranked by travel time plus a delay penalty for each incident on the route. A slightly longer road that avoids a standstill jam or a flood wins. Police and cameras add no penalty; you're warned about them instead.
- **Turn-by-turn navigation**: voice guidance in Bahasa Melayu or English, "hazard ahead" alerts within 800 m, automatic rerouting when you leave the route, live ETA and a screen wake lock.
- **Simulasi mode**: drive the route virtually, which is handy on a desktop or for demos.
- **Malaysia-scoped search**: Nominatim results limited to Malaysia and sorted by distance from you. Long-press the map to drop a destination.
- **Bilingual**: BM by default, with a one-tap switch to English.
- **Installable PWA**: no dependencies and no build step.

## Run it

```bash
npm start          # http://localhost:3000
npm test           # unit + API tests (node:test)
```

Requires Node 20+. There are no npm dependencies.

| Env var | Default | Purpose |
| --- | --- | --- |
| `PORT` | `3000` | HTTP port |
| `DATA_FILE` | `data/reports.json` | Where reports persist |
| `OSRM_URL` | `https://router.project-osrm.org` | Routing engine |
| `NOMINATIM_URL` | `https://nominatim.openstreetmap.org` | Geocoding |
| `USER_AGENT` | `SelokBelok/0.1 (...)` | Sent to upstream services |

Geolocation needs HTTPS (or `localhost`) in the browser.

## Architecture

```
public/            static PWA (Leaflet + OpenStreetMap tiles)
  js/app.js        map, search, routing UI, navigation, reporting
  js/geo.js        pure geometry: distances, route matching, route ranking (shared with server)
  js/reportTypes.js report catalogue + expiry rules (shared with server)
  js/i18n.js       BM / EN strings, instruction text, formatting
server/
  index.js         HTTP server: REST API, SSE stream, static files, rate limiting
  store.js         report store: validation, merge, voting, expiry, JSON persistence
  providers.js     cached proxies to OSRM (routing) and Nominatim (search)
test/              node:test suites
```

### API

| Method | Path | |
| --- | --- | --- |
| `GET` | `/api/reports?bbox=s,w,n,e` | Active reports |
| `POST` | `/api/reports` | `{type, subtype?, lat, lng, note?}` returns `201`, or `200` with `merged: true` |
| `POST` | `/api/reports/:id/vote` | `{stillThere: boolean}` |
| `GET` | `/api/stream` | SSE: `added` / `updated` / `removed` |
| `GET` | `/api/geocode?q=&near=lat,lng` | Place search (Malaysia only) |
| `GET` | `/api/reverse?at=lat,lng` | Reverse geocode |
| `GET` | `/api/route?from=lat,lng&to=lat,lng` | Up to 3 routes with steps |

## Before production

The public OSRM demo server, Nominatim and the OSM tile servers are rate-limited and fine for development only. For real traffic:

- Self-host OSRM with the [Malaysia/Singapore/Brunei extract](https://download.geofabrik.de/asia/malaysia-singapore-brunei.html) and Nominatim, or use a commercial provider. Point `OSRM_URL` / `NOMINATIM_URL` at them, and use a tile provider with an SLA.
- Move reports from the JSON file to a database (Postgres + PostGIS). Fan SSE out through Redis pub/sub so it works across instances.
- Add user accounts and reputation, so trusted reporters count for more and spammers can be muted.
- Use real speed data. GPS traces from navigating users would give live jam detection without anyone having to report it.
- Add toll costs (PLUS, LDP, SPRINT…) and a "avoid tolls" option, plus petrol prices.
