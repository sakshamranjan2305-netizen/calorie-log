// Offline support. App files are pre-cached on install. Requests use the network first (so updates
// show up right away) and fall back to the cache when offline or when the network is slow.
// Open Food Facts requests are cross-origin and are not touched.

const CACHE = 'calorie-log-v4';
const APP_FILES = [
  './',
  'index.html',
  'manifest.webmanifest',
  'css/styles.css',
  'js/app.js',
  'js/router.js',
  'js/ui.js',
  'js/db.js',
  'js/dates.js',
  'js/nutrition.js',
  'js/search.js',
  'js/charts.js',
  'js/install.js',
  'js/views/day.js',
  'js/views/add.js',
  'js/views/portion.js',
  'js/views/foodform.js',
  'js/views/foodsearch.js',
  'js/views/recipe.js',
  'js/views/entry.js',
  'js/views/foods.js',
  'js/views/history.js',
  'js/views/settings.js',
  'data/indb.json',
  'data/basics.json',
  'data/global.json',
  'data/packaged.json',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png',
  'icons/icon-180.png',
];
const NETWORK_TIMEOUT_MS = 3000;

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(APP_FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  event.respondWith(networkFirst(req));
});

async function networkFirst(req) {
  const cache = await caches.open(CACHE);
  const network = fetch(req).then((res) => {
    if (res.ok) cache.put(req, res.clone());
    return res;
  });
  const timeout = new Promise((resolve) => setTimeout(resolve, NETWORK_TIMEOUT_MS));
  try {
    const res = await Promise.race([network, timeout]);
    if (res) return res;
  } catch {
    // offline — fall through to the cache
  }
  const cached = await cache.match(req, { ignoreSearch: true })
    || (req.mode === 'navigate' ? await cache.match('index.html') : undefined);
  return cached || network;
}
