// 舊版網站（純 HTML/JS）的 Service Worker 留下的快取，改版後不會再用到，啟用新版時順手清掉。
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k.indexOf('bp-app-cache') === 0).map((k) => caches.delete(k)))
    )
  );
});
