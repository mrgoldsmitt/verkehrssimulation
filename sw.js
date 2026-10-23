const CACHE_NAME = 'verkehrssim-v0.0.7';
const ASSETS = [
    './',
    './index.html',
    './style.css',
    './app.js',
    './favicon.svg',
    './manifest.json'
];

// Install: Cache assets and immediately activate new worker
self.addEventListener('install', (e) => {
    self.skipWaiting();
    e.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(ASSETS);
        })
    );
});

// Activate: Delete old caches and take control immediately
self.addEventListener('activate', (e) => {
    e.waitUntil(
        Promise.all([
            self.clients.claim(),
            caches.keys().then((keys) => {
                return Promise.all(
                    keys.map((key) => {
                        if (key !== CACHE_NAME) {
                            return caches.delete(key);
                        }
                    })
                );
            })
        ])
    );
});

// Fetch: Network-First strategy (always fetch latest from server, fallback to cache if offline)
self.addEventListener('fetch', (e) => {
    if (e.request.method !== 'GET') return;

    e.respondWith(
        fetch(e.request)
            .then((networkResponse) => {
                // If valid response from server, update cache asynchronously
                if (networkResponse && networkResponse.status === 200) {
                    const responseClone = networkResponse.clone();
                    caches.open(CACHE_NAME).then((cache) => {
                        cache.put(e.request, responseClone);
                    });
                }
                return networkResponse;
            })
            .catch(() => {
                // Offline fallback: serve from cache if available
                return caches.match(e.request);
            })
    );
});
