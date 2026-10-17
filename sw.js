// App-shell service worker for both views. The shell is precached and served cache-first, the
// map library from the CDN is cached on first use, map tiles are cached as they are seen (so a
// zone the unit has looked at still draws without signal), and Supabase traffic always goes to
// the network. Bump VERSION whenever a shell file changes.
const VERSION = 'v17';
const SHELL_CACHE = 'shell-' + VERSION;
const TILE_CACHE = 'tiles-v1';
const SHELL = [
  './', 'index.html', 'manifest.webmanifest',
  'field/', 'field/index.html', 'field/manifest.webmanifest',
  'css/shared.css', 'css/base.css', 'css/field.css',
  'js/shared/rules.js', 'js/shared/data.js', 'js/shared/queue.js', 'js/shared/theme.js', 'js/shared/layers.js',
  'js/base/main.js', 'js/base/map.js', 'js/base/ui.js', 'js/base/print-map.js',
  'js/field/main.js', 'js/field/sensors.js', 'js/field/camera.js',
  'supabase-client.js', 'config.js', 'vendor/supabase-js-2.108.0.min.js',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png', 'icons/apple-touch-icon.png',
  'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css',
  'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js'
];
const MAX_TILES = 1500;

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(SHELL_CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== SHELL_CACHE && k !== TILE_CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.hostname.endsWith('supabase.co')) return;
  if (url.hostname.endsWith('tile.openstreetmap.org') || url.hostname === 'server.arcgisonline.com') { e.respondWith(tile(req)); return; }
  if (url.hostname === 'tile.googleapis.com') return;   // Google's tiles are not kept: their terms limit caching
  if (url.pathname.endsWith('config.local.js')) return;
  e.respondWith(caches.match(req, { ignoreSearch: true }).then((hit) => hit || fetch(req).then((res) => {
    if (res.ok && (url.origin === location.origin || url.hostname === 'cdnjs.cloudflare.com')) {
      const copy = res.clone();
      caches.open(SHELL_CACHE).then((c) => c.put(req, copy));
    }
    return res;
  })));
});

async function tile(req) {
  const cache = await caches.open(TILE_CACHE);
  try {
    const res = await fetch(req);
    if (res.ok) { cache.put(req, res.clone()); trimTiles(cache); }
    return res;
  } catch (err) {
    const hit = await cache.match(req);
    if (hit) return hit;
    throw err;
  }
}

let trimming = false;
async function trimTiles(cache) {
  if (trimming) return;
  trimming = true;
  try {
    const keys = await cache.keys();
    for (let i = 0; i < keys.length - MAX_TILES; i++) await cache.delete(keys[i]);
  } finally { trimming = false; }
}
