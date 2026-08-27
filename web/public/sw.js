/* ==========================================================================
   Service worker — makes the site installable (required by the Android TWA)
   and gives a real answer when the network drops.

   Strategy:
     * navigation requests -> network only, with a static offline page as the
       fallback. The HTML is NEVER cached; see below.
     * static assets       -> cache first. Everything under /_next/static is
       content-hashed, so a hit is always the right file.

   WHY NAVIGATION HTML IS NOT CACHED. Next.js embeds the build's chunk hashes
   in its HTML, and a deploy deletes the previous build's chunks. A cached
   page therefore stops working the moment the site is redeployed: the HTML
   asks for chunks the server no longer has, hydration fails, and the reader
   gets "Application error: a client-side exception has occurred" on a blank
   screen. That is precisely what happened on a slow mobile connection during
   a run of deploys — the navigation fetch timed out, the stale HTML was
   served in its place, and its chunks 404'd.

   Serving a stale IPO list would be the wrong trade anyway: a GMP from three
   hours ago presented as current is worse than an honest "you are offline".

   Bump CACHE_VERSION whenever these rules change; old caches are deleted on
   activate — which is also how the previously cached HTML gets cleared.
   ========================================================================== */

const CACHE_VERSION = "ipo-tracker-v2";
const OFFLINE_URL = "/offline.html";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_VERSION)
      .then((cache) => cache.add(OFFLINE_URL))
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
  // Never touch cross-origin requests (e.g. the Supabase API).
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(() =>
        caches
          .match(OFFLINE_URL)
          .then((cached) => cached || Response.error())
      )
    );
    return;
  }

  // Static assets are content-hashed, so a cached copy is never the wrong
  // version of the file — only ever the right one or absent.
  if (
    url.pathname.startsWith("/_next/static") ||
    url.pathname.startsWith("/icons/")
  ) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        // On a miss, go to the network and hand back whatever it says.
        // The old code returned the (undefined) cache entry when the fetch
        // rejected, and respondWith(undefined) fails the request outright.
        return fetch(request)
          .then((response) => {
            cachePut(request, response);
            return response;
          })
          .catch(() => Response.error());
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
