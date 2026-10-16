// 網路優先：有網路就拿最新版，沒網路才用快取，避免家人的手機一直看到舊版。
const CACHE_NAME = 'bp-app-cache-v4';
const URLS_TO_CACHE = [
  './',
  './index.html',
  './login.html',
  './bp_reports.html',
  './doctor.html',
  './style.css',
  './config.js',
  './auth.js',
  './login.js',
  './script.js',
  './bp_report.js',
  './doctor.js',
  './icons/site.webmanifest'
];
const CACHEABLE_HOSTS = ['cdn.jsdelivr.net', 'fonts.googleapis.com', 'fonts.gstatic.com'];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(URLS_TO_CACHE))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return; // 登入、儲存、讀取資料都是 POST，一律直接連線，不經快取

  const url = new URL(req.url);
  if (url.origin !== location.origin && !CACHEABLE_HOSTS.includes(url.hostname)) return;

  event.respondWith(
    fetch(req)
      .then(res => {
        if (res.ok || res.type === 'opaque') {
          const copy = res.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(req, copy));
        }
        return res;
      })
      .catch(() =>
        caches.match(req).then(hit => hit || (req.mode === 'navigate' ? caches.match('./index.html') : Response.error()))
      )
  );
});
