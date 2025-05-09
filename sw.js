// sw.js
const CACHE_NAME = 'bp-app-cache-v1';
const URLS_TO_CACHE = [
  './',
  './index.html',
  './bp_reports.html',
  './style.css',
  './script.js',
  './bp_report.js',
  './manifest.json',
  // 如有其他外部資源，也可加入 CDN URL：
  'https://cdn.jsdelivr.net/npm/chart.js'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(URLS_TO_CACHE))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => key !== CACHE_NAME)
          .map(key => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(resp => resp || fetch(event.request))
  );
});
