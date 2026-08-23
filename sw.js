// ============================================================================
// sw.js — Service worker for offline capability (spec §6).
// Strategy: cache-first for the app shell + library, network-first-then-cache
// for the Excel data files (so a re-deployed dataset is picked up when
// online, but still works offline once fetched at least once).
// ============================================================================

const CACHE_NAME = 'tf-app-cache-v1';

const APP_SHELL = [
  './',
  './index.html',
  './css/style.css',
  './js/app.js',
  './js/config.js',
  './js/utils.js',
  './js/storage.js',
  './js/state.js',
  './js/excel.js',
  './js/timer.js',
  './js/quiz.js',
  './js/ui.js',
  './js/settings.js',
  './vendor/xlsx.full.min.js',
  './assets/mermaid.png',
];

const DATA_FILES = [
  './data/qkumite.xlsx',
  './data/qkata.xlsx',
  './data/mini-affirmations.xlsx',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      // Individual failures (e.g. optional vendor file missing) must not
      // abort the whole install — cache what we can.
      Promise.allSettled(APP_SHELL.map((url) => cache.add(url)))
    )
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  const isDataFile = DATA_FILES.some((f) => url.pathname.endsWith(f.replace('./', '/')));

  if (isDataFile) {
    // Network-first for data files, falling back to cache when offline,
    // and populating the cache after a successful online fetch (§6).
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // Cache-first for the app shell/library (static assets).
  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request))
  );
});
