/* ==========================================================================
   Service worker — makes the site installable (required by the Android TWA)
   and keeps it usable when the network drops.

   Strategy:
     * navigation requests -> network first, fall back to cache, then to the
       cached home page. IPO data changes constantly, so fresh always wins.
     * static assets       -> stale-while-revalidate, so the shell is instant.

   Bump CACHE_VERSION whenever the caching rules themselves change; the old
   cache is deleted on activate.
   ========================================================================== */

const CACHE_VERSION = "ipo-tracker-v1";
const OFFLINE_URLS = ["/"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_VERSION)
      .then((cache) => cache.addAll(OFFLINE_URLS))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((key) => key !== CACHE_VERSION).map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;

  if (request.method !== "GET") return;

  const url = new URL(request.url);
  // Never cache cross-origin requests (e.g. the Supabase API).
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          cachePut(request, response);
          return response;
        })
        .catch(() =>
          caches
            .match(request)
            .then((cached) => cached || caches.match("/"))
        )
    );
    return;
  }

  // Static assets: serve from cache immediately, refresh in the background.
  if (
    url.pathname.startsWith("/_next/static") ||
    url.pathname.startsWith("/icons/")
  ) {
    event.respondWith(
      caches.match(request).then((cached) => {
        const network = fetch(request)
          .then((response) => {
            cachePut(request, response);
            return response;
          })
          .catch(() => cached);
        return cached || network;
      })
    );
  }
});

/**
 * Store a response only when it is worth replaying offline.
 *
 * Caching a 404 or a 500 would pin that error in place: the cache is served
 * before the network on the next visit, so a momentary server error would
 * become a permanently broken asset. Opaque cross-origin responses are
 * skipped for the same reason — their status is unreadable.
 */
function cachePut(request, response) {
  if (!response || !response.ok || response.type === "opaque") return;
  const copy = response.clone();
  caches
    .open(CACHE_VERSION)
    .then((cache) => cache.put(request, copy))
    .catch(() => {
      /* storage full or disabled — not worth breaking the page over */
    });
}
