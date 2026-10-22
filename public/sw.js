// Keeps the app shell available offline. App files are fetched from the
// network first so updates arrive immediately; the cache is the fallback.
// API calls and map tiles are never cached here.
const CACHE = 'selokbelok-v1';
const SHELL = [
  '/', '/index.html', '/styles.css', '/manifest.webmanifest', '/icon.svg', '/icons/icon-192.png',
  '/js/app.js', '/js/geo.js', '/js/i18n.js', '/js/reportTypes.js', '/js/reportRules.js', '/js/mapServices.js',
  '/js/backend.js', '/js/config.js', '/js/native.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin || url.pathname.startsWith('/api/')) return;
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy));
        }
        return res;
      })
      .catch(() => caches.match(e.request).then((hit) => hit || caches.match('/index.html'))),
  );
});
