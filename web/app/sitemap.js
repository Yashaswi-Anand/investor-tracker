import { SITE } from "../lib/config";
import { getAllSlugs } from "../lib/data";

/** Dynamic sitemap built from the database — served at /sitemap.xml. */
export default async function sitemap() {
  const rows = await getAllSlugs();

  // lastModified was `new Date()` for every static page, which reports the
  // moment the sitemap was requested rather than the moment anything
  // changed — so every crawl saw six pages that had "just changed" and none
  // of them had. Crawlers learn to distrust a lastmod that is always now.
  // The newest row we hold is the real answer for the pages built from it.
  const newest = rows.reduce(
    (latest, row) =>
      row.updated_at && (!latest || new Date(row.updated_at) > latest)
        ? new Date(row.updated_at)
        : latest,
    null
  );

  return [
    {
      url: SITE.url,
      lastModified: newest,
      changeFrequency: "hourly",
      priority: 1,
    },
    ...rows.map(({ slug, updated_at }) => ({
      url: `${SITE.url}/ipo/${slug}`,
      lastModified: updated_at ? new Date(updated_at) : new Date(),
      changeFrequency: "hourly",
      priority: 0.8,
    })),
    // /ipo lists every issue we hold, so it is the one page that reaches
    // the ones the homepage's current-month view does not.
    {
      url: `${SITE.url}/ipo`,
      lastModified: newest,
      changeFrequency: "daily",
      priority: 0.9,
    },
    // /allotment is here now: it is linked, indexable, and answers a query
    // family — "<company> IPO allotment status" — that nothing else here
    // does. It was excluded when nothing linked to it, which has changed.
    ...["/news", "/allotment", "/about", "/contact"].map((path) => ({
      url: `${SITE.url}${path}`,
      lastModified: newest,
      changeFrequency: "daily",
      priority: 0.6,
    })),
    // These change once a year at most, and saying otherwise every time the
    // sitemap is requested is the same lie as above, only slower to notice.
    ...["/privacy", "/terms"].map((path) => ({
      url: `${SITE.url}${path}`,
      changeFrequency: "yearly",
      priority: 0.3,
    })),
  ];
}
