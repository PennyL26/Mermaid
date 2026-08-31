// ============================================================
// sw.js — offline caching for the Penny TRUE/FALSE app.
// Registered automatically by js/app.js on first load. If
// registration fails (unsupported browser), the app continues
// normally without offline support (spec section 6).
// ============================================================
const CACHE_NAME = "penny-app-cache-v1";

const APP_SHELL = [
  "./",
  "index.html",
  "css/style.css",
  "js/app.js",
  "js/state.js",
  "js/ui.js",
  "js/excel.js",
  "js/quiz.js",
  "js/timer.js",
  "js/settings.js",
  "js/storage.js",
  "js/utils.js",
  "vendor/xlsx.full.min.js",
  "data/qkumite.xlsx",
  "data/qkata.xlsx",
  "data/mini-affirmations-mermaid.xlsx",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .catch((err) => {
        // Don't fail install just because e.g. one optional asset 404s.
        console.warn("[sw] partial precache failure", err);
      })
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) => Promise.all(names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n))))
      .then(() => self.clients.claim())
  );
});

// Cache-first for same-origin GET requests, falling back to network,
// and updating the cache with fresh copies as they come in (stale-while-revalidate-ish).
self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // don't touch cross-origin requests

  event.respondWith(
    caches.match(req).then((cached) => {
      const networkFetch = fetch(req)
        .then((res) => {
          if (res && res.ok) {
            const clone = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, clone));
          }
          return res;
        })
        .catch(() => cached); // offline: fall back to whatever we had cached

      return cached || networkFetch;
    })
  );
});
