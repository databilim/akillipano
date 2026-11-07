// Ana ekrana eklenen uygulama için service worker.
// Sayfa ve API istekleri her zaman ağdan gelir (pano durumu güncel olmalı);
// yalnızca css/js/resim dosyaları önbellekten hızlı açılır, arka planda yenilenir.
const ONBELLEK = 'pano-statik-v2';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((anahtarlar) => Promise.all(
    anahtarlar.filter((a) => a !== ONBELLEK).map((a) => caches.delete(a)),
  )).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (event) => {
  const istek = event.request;
  const url = new URL(istek.url);
  if (istek.method !== 'GET' || url.origin !== self.location.origin) return;
  if (!/^\/(css|js|img)\//.test(url.pathname)) return;
  event.respondWith(caches.open(ONBELLEK).then(async (onbellek) => {
    const kayitli = await onbellek.match(istek);
    const agdan = fetch(istek).then((cevap) => {
      if (cevap.ok) onbellek.put(istek, cevap.clone());
      return cevap;
    }).catch(() => kayitli);
    return kayitli || agdan;
  }));
});
