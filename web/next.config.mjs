/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  async headers() {
    return [
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
