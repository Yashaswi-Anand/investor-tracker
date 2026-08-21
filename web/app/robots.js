import { SITE } from "../lib/config";

/** Served at /robots.txt */
export default function robots() {
  return {
    rules: [{ userAgent: "*", allow: "/" }],
    sitemap: `${SITE.url}/sitemap.xml`,
    // The host directive takes a bare hostname — a scheme makes it invalid.
    host: new URL(SITE.url).host,
  };
}
