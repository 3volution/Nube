const CACHE_NAME = 'guardiancharger-v13.25';

// Install - skip waiting para activar inmediatamente
self.addEventListener('install', (event) => {
  self.skipWaiting();
});

// Activate - limpiar TODOS los caches anteriores
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      );
    }).then(() => clients.claim())
  );
});

// Fetch - network first, sin fallback a cache para evitar servir versiones antiguas
self.addEventListener('fetch', (event) => {
  // Solo interceptar GET requests de la misma origin
  if (event.request.method !== 'GET') return;
  if (!event.request.url.startsWith(self.location.origin)) return;

  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
  );
});
