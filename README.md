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
- **Android app and installable web app**: a native Android build with voice and keep-awake, plus a web app you can add to the home screen on any phone.

## Get the app

### Android

Download `app-debug.apk` from the latest **Android APK** run under the repository's Actions tab, or build it yourself (below). Copy it to the phone, open it, and allow installing from that source.

The app works without a server: search and routing call OpenStreetMap's public services directly, and your reports are saved on your phone only. To share reports live with other drivers, deploy the server and build the app with its address (see below).

### Any phone, through the browser

Open the deployed site in Chrome (Android) or Safari (iPhone) and choose **Add to Home Screen**. It runs full-screen like an app, and reports are shared live.

## Run the server

```bash
npm start          # http://localhost:3000
npm test           # unit + API tests (node:test)
```

The server needs Node 20+ and no npm packages. Geolocation in the browser needs HTTPS (or `localhost`).

| Env var | Default | Purpose |
| --- | --- | --- |
| `PORT` | `3000` | HTTP port |
| `DATA_FILE` | `data/reports.json` | Where reports persist |
| `OSRM_URL` | `https://router.project-osrm.org` | Routing engine |
| `NOMINATIM_URL` | `https://nominatim.openstreetmap.org` | Geocoding |
| `USER_AGENT` | `SelokBelok/0.1 (...)` | Sent to upstream services |

To deploy it, use the Dockerfile with any container host (Fly.io, Render, Railway, a VPS):

```bash
docker build -t selokbelok .
docker run -p 3000:3000 -v selokbelok-data:/data selokbelok
```

## Build the Android app

You need Node 20+, JDK 21 and the Android SDK (Android Studio installs it; set `ANDROID_HOME`).

```bash
npm install
API_URL=https://your-server.example.com npm run apk
# → android/app/build/outputs/apk/debug/app-debug.apk
```

Leave out `API_URL` to build the no-server version. `npm run build:app` only prepares the project, so you can open `android/` in Android Studio to run it on a device or make a signed release build for the Play Store. In CI, set the repository variable `API_URL` and the workflow builds with it.

The native app adds:
- spoken directions through Android's text-to-speech engine (the WebView has no `speechSynthesis`)
- the screen staying on while navigating
- GPS permission prompts
- a bundled copy of Leaflet, so the app starts without a CDN

## Architecture

```
public/              the web app (Leaflet + CARTO/OpenStreetMap tiles), also bundled into the Android app
  js/app.js          map, search, routing UI, navigation, reporting
  js/backend.js      data access: the server API, or on-device storage when there is no server
  js/geo.js          pure geometry: distances, route matching, route ranking
  js/reportRules.js  report validation, merging, voting (shared with the server)
  js/reportTypes.js  report catalogue + expiry rules
  js/mapServices.js  Nominatim / OSRM request builders and parsers (shared with the server)
  js/native.js       Android text-to-speech and keep-awake, with browser fallbacks
  js/config.js       server URL and map tiles (rewritten by the Android build)
  sw.js              offline app shell for the installable web app
server/
  index.js           HTTP server: REST API (CORS-enabled), SSE stream, static files, rate limiting
  store.js           report store with JSON persistence
  providers.js       cached proxies to OSRM and Nominatim
scripts/build-app.mjs  prepares www/ and capacitor.config.json for the Android build
android/             Capacitor Android project
test/                node:test suites
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

The public OSRM demo server, Nominatim and the free CARTO map tiles are rate-limited and fine for development and small tests only. For real traffic:

- Self-host OSRM with the [Malaysia/Singapore/Brunei extract](https://download.geofabrik.de/asia/malaysia-singapore-brunei.html) and Nominatim, or use a commercial provider. Point `OSRM_URL` / `NOMINATIM_URL` at them, and use a tile provider with an SLA.
- Move reports from the JSON file to a database (Postgres + PostGIS). Fan SSE out through Redis pub/sub so it works across instances.
- Add user accounts and reputation, so trusted reporters count for more and spammers can be muted.
- Use real speed data. GPS traces from navigating users would give live jam detection without anyone having to report it.
- Make a signed release build and publish to Google Play. Add an iOS build (`npx cap add ios`, which needs a Mac).
- Add toll costs (PLUS, LDP, SPRINT…) and a "avoid tolls" option, plus petrol prices.
