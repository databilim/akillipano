// Ana ekrana eklenen uygulama için service worker.
// Her şey önce ağdan istenir; yalnızca ağ yoksa (Pi kapalı, internet yok) önbellekteki
// css/js/resim kullanılır. Böylece güncellemeden sonra hiçbir zaman eski dosya çalışmaz.
const ONBELLEK = 'pano-statik-v3';

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
  event.respondWith(fetch(istek).then((cevap) => {
    if (cevap.ok) {
      const kopya = cevap.clone();
      caches.open(ONBELLEK).then((c) => c.put(istek, kopya));
    }
    return cevap;
  }).catch(() => caches.match(istek)));
});
