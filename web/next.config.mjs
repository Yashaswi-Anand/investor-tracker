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

  // Firebase's sign-in handler, served from this domain instead of
  // investor-ipo-tracker.firebaseapp.com.
  //
  // Google's account chooser names the domain the OAuth handshake runs
  // through, so with the handler on firebaseapp.com every reader was asked to
  // "continue to investor-ipo-tracker.firebaseapp.com" — a domain they have
  // never heard of, on the screen where they are deciding whether to trust us
  // with their Google account. This is the proxy Firebase documents for
  // exactly that (and for browsers that block third-party storage, where a
  // redirect sign-in through another domain fails outright).
  //
  // It does nothing until NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN is switched to
  // investor.socialriser.com, and that must not happen before
  // https://investor.socialriser.com/__/auth/handler is an authorised
  // redirect URI on the OAuth client, or Google sign-in fails with
  // redirect_uri_mismatch. Order: deploy this, add the URI, then flip the var.
  async rewrites() {
    return [
      {
        source: "/__/auth/:path*",
        destination: "https://investor-ipo-tracker.firebaseapp.com/__/auth/:path*",
      },
      {
        // handler.js asks for this at runtime. It 404s on firebaseapp.com
        // too; proxying it keeps the behaviour identical rather than
        // answering with this site's own 404 page.
        source: "/__/firebase/:path*",
        destination: "https://investor-ipo-tracker.firebaseapp.com/__/firebase/:path*",
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
