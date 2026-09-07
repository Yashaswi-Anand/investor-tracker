import { SITE } from "../lib/config";

/** Served at /robots.txt */
export default function robots() {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        // /api/doc fetches a ZIP from NSE, unzips it in memory and serves the
        // PDF inside — up to 48MB, and 25 seconds when NSE is slow. Every IPO
        // page links five of them, so the crawlable API surface was four
        // times the size of the real site and far slower. Googlebot throttles
        // a whole host when it meets responses like that, which lands on the
        // pages whose freshness is the entire point of this site.
        disallow: ["/api/"],
      },
    ],
    sitemap: `${SITE.url}/sitemap.xml`,
    // The host directive takes a bare hostname — a scheme makes it invalid.
    host: new URL(SITE.url).host,
  };
}
