// Service worker de la PWA Ghettoway.
// - Fichiers du jeu (HTML, JS, CSS, JSON) : toujours redemandés au serveur, la copie locale ne sert que hors connexion
//   → les joueurs ont toujours la dernière version après une mise en ligne.
// - Images : servies depuis le téléphone pour aller plus vite, et rafraîchies en arrière-plan.
const CACHE = 'ghettoway-v1';

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);
  // Seulement nos propres fichiers en lecture ; le temps réel (socket.io) et les CDN passent directement
  if (req.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/socket.io')) return;

  if (/\.(jpg|jpeg|png|webp|gif|svg)$/i.test(url.pathname)) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE);
      const cached = await cache.match(req);
      const refresh = fetch(req).then(res => { if (res.ok) cache.put(req, res.clone()); return res; }).catch(() => cached);
      return cached || refresh;
    })());
    return;
  }

  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    try {
      const res = await fetch(req, { cache: 'no-cache' });
      if (res.ok) cache.put(req, res.clone());
      return res;
    } catch (e) {
      const cached = await cache.match(req);
      if (cached) return cached;
      throw e;
    }
  })());
});
