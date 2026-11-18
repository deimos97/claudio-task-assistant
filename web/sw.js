// Service worker mínimo: primero la red (para que los despliegues lleguen al momento)
// y, si no hay conexión, lo último guardado. La API nunca se cachea.
const CACHE = 'claudio-v2';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(
  caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()),
));

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin || url.pathname.includes('/api/')) return;
  // Audio y vídeo, directos al servidor: Safari pide trozos (Range) y a través del
  // service worker no los reproduce.
  if (e.request.headers.has('range') || e.request.destination === 'audio' || e.request.destination === 'video') return;
  if (url.pathname.includes('/_')) return; // páginas de prueba (web/_*): nunca a la caché
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        if (res.status === 200) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {});
        }
        return res;
      })
      .catch(() => caches.match(e.request)),
  );
});
