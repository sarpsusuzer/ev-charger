// Offline cache for the home-screen app. Bump VERSION when files change.
const VERSION = 'ev-charger-v5';
const PRECACHE = [
  './', 'index.html', 'styles.css', 'app.js', 'manifest.webmanifest',
  'icons/apple-touch-icon.png',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png',
  'assets/ac-off.png',
  'assets/ac.png',
  'assets/accessibility.svg',
  'assets/bath.svg',
  'assets/battery-dark.svg',
  'assets/battery-light.svg',
  'assets/camera.png',
  'assets/coffee.svg',
  'assets/dc-off.png',
  'assets/dc-out.png',
  'assets/dc.png',
  'assets/divider.svg',
  'assets/map.png',
  'assets/ring-arc.png',
  'assets/ring-inner.svg',
  'assets/ring-outer.svg',
  'assets/ring-tick.svg',
  'assets/scan-corners.svg',
  'assets/search.svg',
  'assets/signal-dark.svg',
  'assets/signal-light.svg',
  'assets/sliders.svg',
  'assets/wifi-amenity.svg',
  'assets/wifi-dark.svg',
  'assets/wifi-light.svg',
  'assets/zap-badge.svg',
  'assets/zap-pin-lg.svg',
  'assets/zap-pin-off.svg',
  'assets/zap-pin.svg',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Cache first, refreshed in the background; Google Fonts are cached as they load.
self.addEventListener('fetch', e => {
  const { request } = e;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  const sameOrigin = url.origin === location.origin;
  const font = /fonts\.(googleapis|gstatic)\.com$/.test(url.hostname);
  if (!sameOrigin && !font) return;

  e.respondWith(caches.open(VERSION).then(async cache => {
    const cached = await cache.match(request, { ignoreSearch: sameOrigin });
    const network = fetch(request).then(res => {
      if (res.ok || res.type === 'opaque') cache.put(request, res.clone());
      return res;
    }).catch(() => cached);
    return cached || network;
  }));
});
