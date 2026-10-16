// 網路優先：有網路就拿最新版，沒網路才用快取，避免家人的手機一直看到舊版。
// 連瀏覽器本身的暫存（GitHub Pages 預設會留 10 分鐘）也要繞過，不然剛更新完，手機會拿到新的 JS 卻配舊的 CSS。
const CACHE_NAME = 'bp-app-cache-v5';
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
      .then(cache => Promise.all(URLS_TO_CACHE.map(url => cache.add(new Request(url, { cache: 'reload' })))))
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
    fetch(req, url.origin === location.origin ? { cache: 'no-cache' } : undefined)
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
