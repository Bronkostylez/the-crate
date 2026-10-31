/* THE CRATE service worker: offline shell via stale-while-revalidate. */
const CACHE = 'the-crate-v1'

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => event.waitUntil(clients.claim()))

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url)
  if (event.request.method !== 'GET' || url.origin !== self.location.origin) return
  event.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const cached = await cache.match(event.request)
      const network = fetch(event.request)
        .then((res) => {
          if (res.ok) cache.put(event.request, res.clone())
          return res
        })
        .catch(async () => {
          if (cached) return cached
          // offline with nothing cached for this URL: serve the app shell for navigations
          if (event.request.mode === 'navigate') {
            const shell = await cache.match(new URL('/', self.location.origin + self.registration.scope).pathname)
            if (shell) return shell
          }
          return Response.error()
        })
      return cached || network
    }),
  )
})
