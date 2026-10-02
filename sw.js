const V = 'nagan-v161-shabbat-recommendations';
const SHELL = ['./queue-gesture-feedback.js', './queue-gesture-feedback.css', './song-gestures.js', './song-gestures.css', './genre-fast-start.js', './playlist-import.js', './playlist-import.css', './monthly-listening.js', './monthly-listening.css', './direct-speed.js', './direct-only-playback.js', './genre-song-panels.js', './arabic-catalog-paging.js', './phone-genre-mixes.js', './list-integrity.js', './background-queue.js', './backward-control.js', './', './index.html', './style.css', './app.js', './2-v151-app.js', './shabbat-category.js', './genre-parity.js', './horizontal-page-back.js', './menu-anchor.js', './seek-hold.js', './pop-mediterranean.js', './discovery-1.js', './discovery-2.js', './discovery-3.js', './discovery-4.js', './artist-recommendations.js', './lyrics-modes.js', './lyric-results.js', './arabic-categories.js', './home-vibes.js', './personalized-mixes.js', './search-order.js', './lyrics-controls.js', './friends-playlist.js', './personal-albums.js', './music-domains.js', './song-albums.js', './thumbnail-fill.js', './manifest.webmanifest', './icon-192.png', './icon-512.png', './icon-180.png'];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(V).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== V).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return;
  // network-first: fresh code wins, cache keeps it working offline
  e.respondWith(fetch(e.request).then(r => {
    const copy = r.clone(); caches.open(V).then(c => c.put(e.request, copy)); return r;
  }).catch(() => caches.match(e.request)));
});
