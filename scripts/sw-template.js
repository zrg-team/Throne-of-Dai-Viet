/**
 * The service worker — what makes the game playable with the aeroplane switch on.
 *
 * This file is a TEMPLATE. `scripts/build-sw.mjs` walks the finished `dist/` after every build and
 * fills in the three placeholders below, then writes the result to `dist/sw.js`. Editing
 * `dist/sw.js` by hand edits a build artifact; edit this instead.
 *
 * Two decisions worth stating, because both are load-bearing:
 *
 *   · **It never calls `skipWaiting()` on its own.** A new worker installs, fills its cache, and
 *     then sits in `waiting` until the page posts `SKIP_WAITING`. That is what lets the menu say
 *     "new version ready" and hand the player the tap, instead of swapping the app out from under
 *     a run in progress.
 *   · **One cache per version, holding the shell AND its assets.** `index.html` names hashed
 *     chunks; a cache that versioned them separately could serve last week's HTML pointing at
 *     files this week deleted. Sealed together, they cannot disagree.
 */

const VERSION = '__CACHE_VERSION__';
const CACHE = `vanthang-${VERSION}`;

/** The shell. If any one of these fails to cache, the install fails and the old version stays. */
const CRITICAL = __PRECACHE_CRITICAL__;

/**
 * The art. 267 portrait parts and a QR code, fetched by the Phaser loader at runtime rather than
 * named by the HTML — so a single 404 among them must not cost the player their offline copy of
 * the whole game. Cached best-effort, and whatever misses is picked up by the runtime cache on
 * the first online run that draws it.
 */
const OPTIONAL = __PRECACHE_OPTIONAL__;

/** The app shell's URL, and what every navigation is answered with. */
const SHELL = __SHELL_URL__;

/**
 * `ignoreVary` is the difference between an offline game and a blank screen.
 *
 * A module script and a `crossorigin` font preload are both fetched in CORS mode, so they carry an
 * `Origin` header — and a server that answers with `Vary: Origin` (vite preview does; a CDN may)
 * makes `caches.match` refuse a perfectly good entry because the *precache* fetch, which is not
 * CORS, sent no such header. Symptom: 300 files cached, and the bundle and the Vietnamese fonts
 * still fail with ERR_FAILED the moment the network drops. Nothing here is content-negotiated —
 * one URL is one file — so matching on the URL alone is both safe and what was meant.
 */
const MATCH = { cacheName: CACHE, ignoreVary: true };

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // `cache: 'reload'` on every request: GitHub Pages serves with `max-age=600`, and without this
    // an install a few minutes after a deploy can seal a stale copy of the shell into a cache
    // named after the new one — a version mismatch with no way to notice it.
    await cache.addAll(CRITICAL.map((url) => new Request(url, { cache: 'reload' })));
    await Promise.allSettled(OPTIONAL.map((url) => cache.add(new Request(url, { cache: 'reload' }))));
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.map((name) => (
      name !== CACHE && name.startsWith('vanthang-') ? caches.delete(name) : undefined
    )));
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  const type = event.data && event.data.type;
  if (type === 'SKIP_WAITING') {
    self.skipWaiting();
    return;
  }
  if (type === 'GET_VERSION' && event.ports && event.ports[0]) {
    event.ports[0].postMessage(VERSION);
  }
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  // Outside our own sub-path the worker has no business answering — on GitHub Pages the scope is
  // one project among many on the same origin.
  if (!url.pathname.startsWith(new URL('./', self.location.href).pathname)) return;

  // Every navigation is the same page. The game is one HTML file and a canvas; there is no route
  // to preserve, and answering from cache is what makes a cold launch work with no network.
  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      const cached = await caches.match(SHELL, MATCH);
      if (cached) return cached;
      try {
        return await fetch(request);
      } catch {
        return (await caches.match(SHELL, { ignoreVary: true })) ?? Response.error();
      }
    })());
    return;
  }

  event.respondWith((async () => {
    const cached = await caches.match(request, MATCH);
    if (cached) return cached;
    try {
      const response = await fetch(request);
      // Opaque and error responses are not worth keeping: a cached 404 is indistinguishable from
      // a cached asset next time, and it never expires.
      if (response.ok && response.type === 'basic') {
        const cache = await caches.open(CACHE);
        cache.put(request, response.clone());
      }
      return response;
    } catch {
      return (await caches.match(request, { ignoreVary: true })) ?? Response.error();
    }
  })());
});
