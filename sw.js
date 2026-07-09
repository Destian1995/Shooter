const CACHE_NAME = 'strelok-v4';
const ASSETS = [
    './',
    './index.html',
    './manifest.json',
    './js/sound.js',
    './js/utils.js',
    './js/particles.js',
    './js/bullet.js',
    './js/level.js',
    './js/player.js',
    './js/ui.js',
    './js/game.js',
];

self.addEventListener('install', (e) => {
    e.waitUntil(
        caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
    );
    self.skipWaiting();
});

self.addEventListener('activate', (e) => {
    e.waitUntil(
        caches.keys().then((keys) =>
            Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
        )
    );
    self.clients.claim();
});

self.addEventListener('fetch', (e) => {
    e.respondWith(
        caches.match(e.request).then((cached) => cached || fetch(e.request))
    );
});
