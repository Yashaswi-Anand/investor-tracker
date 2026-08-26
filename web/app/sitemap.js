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
    // Both are marked indexable, so leaving them out of the sitemap would be
    // the two documents disagreeing about whether they should be found.
    ...["/privacy", "/terms"].map((path) => ({
      url: `${SITE.url}${path}`,
      lastModified: new Date(),
      changeFrequency: "yearly",
      priority: 0.3,
    })),
  ];
}
