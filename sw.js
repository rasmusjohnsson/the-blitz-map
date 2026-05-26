// Service Worker för Gråstensväktarna PWA
// Versionera CACHE_NAME för att invalidera vid uppdateringar
const CACHE_VERSION = 'v2.3.0';
const CACHE_NAME = 'grastensvaktarna-' + CACHE_VERSION;

// Filer att förcacha vid install
const PRECACHE = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './map.jpg',
  './askhalan.jpg',
  './greenest.jpg',
  './manifest.json',
  './data/characters.json',
  './data/locations.json',
  './data/sessions.json',
  './data/npcs.json',
  './data/factions.json',
  'https://fonts.googleapis.com/css2?family=Silkscreen:wght@400;700&display=swap'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME)
      .then(c => c.addAll(PRECACHE.filter(u => !u.startsWith('http')).concat([])))
      .then(() => self.skipWaiting())
      .catch(err => console.warn('Precache delvis misslyckad:', err))
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k.startsWith('grastensvaktarna-') && k !== CACHE_NAME)
        .map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Stale-while-revalidate för bättre offline-upplevelse
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  // Skip cross-origin except fonts
  if (url.origin !== location.origin && !url.host.includes('fonts.g')) return;
  e.respondWith(
    caches.open(CACHE_NAME).then(async cache => {
      const cached = await cache.match(e.request);
      const fetchPromise = fetch(e.request).then(resp => {
        if (resp && resp.ok) cache.put(e.request, resp.clone());
        return resp;
      }).catch(() => cached);
      return cached || fetchPromise;
    })
  );
});
