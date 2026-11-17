/* Offline cache: the app shell is cached on install; pages are served cache-first and refreshed in the background. */
const CACHE = 'aiec-os-v2.0.0';
const SHELL = ['./', './index.html', './css/app.css', './js/i18n.js', './js/domain.js', './js/store.js', './js/ui.js', './js/app.js', './js/screens.js', './js/screens2.js', './js/flows.js', './js/demo.js', './manifest.webmanifest', './icons/icon.svg', './icons/maskable.svg'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith(caches.match(req, { ignoreSearch: true }).then(hit => {
    const net = fetch(req).then(res => { if (res && res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); } return res; }).catch(() => hit || caches.match('./index.html'));
    return hit || net;
  }));
});
