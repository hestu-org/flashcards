// Offline support for Flashcards. Serves the cached app instantly, then
// refreshes the cache in the background and tells the page if it changed.
const CACHE = 'flashcards-v1';
const INDEX = new URL('./index.html', self.registration.scope).href;

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(c => c.add(new Request(INDEX, { cache: 'reload' }))));
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) if (key !== CACHE) await caches.delete(key);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (req.mode === 'navigate' || url.href === INDEX) event.respondWith(serveApp(event));
});

async function serveApp(event) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(INDEX);
  const refresh = (async () => {
    try {
      let res = await fetch(INDEX, { cache: 'no-cache' });
      if (!res.ok) return null;
      // Safari refuses redirected responses for navigations; store a clean copy.
      if (res.redirected) res = new Response(await res.blob(), { status: res.status, headers: res.headers });
      const fresh = await res.clone().text();
      const old = cached ? await (await cache.match(INDEX)).text() : null;
      await cache.put(INDEX, res.clone());
      if (old !== null && old !== fresh) {
        for (const client of await self.clients.matchAll({ type: 'window' })) client.postMessage({ type: 'updated' });
      }
      return res;
    } catch (e) {
      return null;
    }
  })();
  if (cached) {
    event.waitUntil(refresh);
    return cached;
  }
  return (await refresh) || new Response('Offline and not cached yet. Open the app once while online.', {
    status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}
