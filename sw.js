// Hard Steel War: service worker that makes the game installable and playable offline.
//
// How it behaves:
// - Online: the game page, the 3D engine (vendor/three.js) and app icons always come
//   from the server, so whatever you push to GitHub reaches players the next time
//   they open the game.
// - Offline, or when the server doesn't answer within a few seconds: it uses the
//   last copy it saved instead.
// - Multiplayer (Supabase), custom game servers and every other site are never touched.
//
// You don't need to edit this file when you update index.html. Change CACHE only
// if you change the FILES list below.

const CACHE = 'hsw-app-v2';
const NETWORK_TIMEOUT_MS = 4000;
const FILES = [
  './',
  './vendor/three.js',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/maskable-512.png',
  './icons/apple-touch-icon.png'
];

const absolute = path => new URL(path, self.location).href;
const GAME_PAGE = absolute('./');
const GAME_PAGE_URLS = new Set([GAME_PAGE, absolute('./index.html')]);
const ASSET_URLS = new Set(FILES.slice(1).map(absolute));

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE)
      .then(cache => cache.addAll(FILES))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys
        .filter(key => key.startsWith('hsw-app-') && key !== CACHE)
        .map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  url.search = '';
  url.hash = '';

  let key = null;
  if (request.mode === 'navigate') {
    if (GAME_PAGE_URLS.has(url.href)) key = GAME_PAGE;
  } else if (ASSET_URLS.has(url.href)) {
    key = url.href;
  }
  if (key) event.respondWith(networkFirst(event, key));
});

// Ask the server first and save good answers for offline use. Fall back to the
// saved copy if the network fails or takes too long.
function networkFirst(event, key) {
  let saving = Promise.resolve();
  const network = fetch(event.request).then(response => {
    if (response.ok && response.type === 'basic') {
      const copy = response.clone();
      saving = caches.open(CACHE).then(cache => cache.put(key, copy));
    }
    return response;
  });
  // Keep the worker alive until the fresh copy is saved, even if the saved copy answered first.
  event.waitUntil(network.then(() => saving).catch(() => {}));

  return caches.open(CACHE)
    .then(cache => cache.match(key))
    .then(saved => {
      if (!saved) return network;
      const timeout = new Promise(resolve => setTimeout(resolve, NETWORK_TIMEOUT_MS, saved));
      return Promise.race([network.catch(() => saved), timeout]);
    });
}
