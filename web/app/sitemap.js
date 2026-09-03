import { SITE } from "../lib/config";
import { getAllSlugs } from "../lib/data";

/** Dynamic sitemap built from the database — served at /sitemap.xml. */
export default async function sitemap() {
  const rows = await getAllSlugs();

  return [
    {
      url: SITE.url,
      lastModified: new Date(),
      changeFrequency: "hourly",
      priority: 1,
    },
    ...rows.map(({ slug, updated_at }) => ({
      url: `${SITE.url}/ipo/${slug}`,
      lastModified: updated_at ? new Date(updated_at) : new Date(),
      changeFrequency: "hourly",
      priority: 0.8,
    })),
    // The other two pages people arrive at directly. Both carry their own
    // title and description and are marked indexable, so leaving them out
    // would be the two documents disagreeing about whether they exist.
    ...["/news", "/allotment", "/about", "/contact"].map((path) => ({
      url: `${SITE.url}${path}`,
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 0.6,
    })),
    // Indexable for the same reason, but they change once a year at most.
    ...["/privacy", "/terms"].map((path) => ({
      url: `${SITE.url}${path}`,
      lastModified: new Date(),
      changeFrequency: "yearly",
      priority: 0.3,
    })),
  ];
}
