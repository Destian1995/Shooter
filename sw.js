const CACHE_NAME = 'strelok-v10';
const ASSETS = [
    './',
    './index.html',
    './manifest.json',
    './icon-192.png',
    './icon-512.png',
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

// cache-first: сначала кэш, потом сеть (полный офлайн)
// при наличии сети — обновляем кэш в фоне
self.addEventListener('fetch', (e) => {
    e.respondWith(
        caches.match(e.request).then((cached) => {
            // фоновое обновление кэша (stale-while-revalidate)
            const fetchPromise = fetch(e.request).then((res) => {
                if (res && res.status === 200) {
                    const clone = res.clone();
                    caches.open(CACHE_NAME).then((cache) => cache.put(e.request, clone));
                }
                return res;
            }).catch(() => null);

            // если есть в кэше — отдаём сразу, иначе ждём сеть
            return cached || fetchPromise;
        })
    );
});
