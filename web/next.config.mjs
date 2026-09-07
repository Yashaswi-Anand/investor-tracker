/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,

  // www served the entire site at 200 alongside the apex — every URL existing
  // twice, on a site where nothing is cached, so each duplicate is a full
  // render plus its database queries. The canonical tags meant Google would
  // most likely consolidate anyway, but a hint is weaker than a redirect and
  // any link that lands on www should arrive at the real host.
  async redirects() {
    return [
      {
        source: "/:path*",
        has: [{ type: "host", value: "www.investor.socialriser.com" }],
        destination: "https://investor.socialriser.com/:path*",
        permanent: true,
      },
    ];
  },

  async headers() {
    return [
      // Everything, first, so the more specific entries below still win.
      {
        source: "/:path*",
        headers: [
          // Not a ranking factor, and not claimed as one. It closes the
          // plaintext first hop the http->https redirect leaves open, which
          // matters here because readers type PAN numbers into /allotment.
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains",
          },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          {
            key: "Permissions-Policy",
            value: "geolocation=(), microphone=(), camera=()",
          },
        ],
      },
      {
        // robots.txt stops the API being crawled again; this drops whatever
        // was already discovered, which robots.txt alone cannot do — a URL
        // blocked from crawling can still sit in the index as a bare link.
        source: "/api/:path*",
        headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }],
      },
      {
        // The service worker must be revalidated on every load, or updates
        // never reach users.
        //
        // Use "no-cache" (revalidate before use), NOT "no-store": Chrome
        // refuses to register a service worker whose script is served with
        // no-store, failing with "An unknown error occurred when fetching
        // the script" — which would silently break both the PWA install
        // prompt and the Android TWA.
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
      {
        // Digital Asset Links proves domain ownership to the Android app.
        source: "/.well-known/assetlinks.json",
        headers: [{ key: "Content-Type", value: "application/json" }],
      },
    ];
  },
};

export default nextConfig;
