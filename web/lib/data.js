/**
 * Data access. All reads go through the Supabase REST API with the anon key
 * (RLS allows SELECT only). Every request uses ISR caching.
 *
 * Every function fails soft — a missing database returns an empty result and
 * the page renders its empty state rather than crashing the build.
 */

import {
  REVALIDATE_SECONDS,
  isConfigured,
  supabaseHeaders,
  supabaseUrl,
} from "./config";

async function get(endpointKey, query, revalidate = REVALIDATE_SECONDS) {
  if (!isConfigured()) return [];
  try {
    const res = await fetch(`${supabaseUrl(endpointKey)}?${query}`, {
      headers: supabaseHeaders(),
      next: { revalidate },
    });
    if (!res.ok) return [];
    const body = await res.json();
    // PostgREST returns an error object (not an array) on some 2xx paths;
    // callers all expect a list, so anything else becomes an empty result.
    return Array.isArray(body) ? body : [];
  } catch {
    return [];
  }
}

/** Derived values the database does not store. */
function enrich(ipo) {
  if (!ipo) return ipo;
  const out = { ...ipo };
  if (out.min_investment == null && out.lot_size && out.price_band_high) {
    out.min_investment = Math.round(out.lot_size * out.price_band_high);
  }
  if (out.estimated_listing == null && out.gmp != null && out.price_band_high) {
    out.estimated_listing = Number(out.price_band_high) + Number(out.gmp);
  }
  return out;
}

const ORDER = { open: 0, upcoming: 1, closed: 2, listed: 3 };

/**
 * Every IPO, sorted so live issues appear first.
 *
 * Within a status group the direction differs on purpose: upcoming IPOs sort
 * soonest-first (the one opening tomorrow matters most), while open, closed
 * and listed sort most-recent-first.
 */
export async function getAllIpos() {
  const rows = await get("ipos", "select=*&order=open_date.desc.nullslast&limit=500");
  return rows.map(enrich).sort((a, b) => {
    const byStatus = (ORDER[a.status] ?? 9) - (ORDER[b.status] ?? 9);
    if (byStatus !== 0) return byStatus;

    const aDate = String(a.open_date || "");
    const bDate = String(b.open_date || "");
    if (!aDate || !bDate) return bDate.localeCompare(aDate);

    return a.status === "upcoming"
      ? aDate.localeCompare(bDate)
      : bDate.localeCompare(aDate);
  });
}

export async function getIpoBySlug(slug) {
  const rows = await get(
    "ipos",
    `select=*&slug=eq.${encodeURIComponent(slug)}&limit=1`
  );
  return rows.length ? enrich(rows[0]) : null;
}

/**
 * GMP snapshots, oldest first.
 *
 * The query orders DESCENDING and reverses in memory. Ordering ascending
 * with a limit would take the OLDEST rows, so once an IPO accumulated more
 * snapshots than the limit (the scraper writes ~48 a day) the chart would
 * silently freeze on its first few days and never show current data again.
 */
export async function getGmpHistory(slug, limit = 300) {
  const rows = await get(
    "gmpHistory",
    `select=gmp,recorded_at&slug=eq.${encodeURIComponent(slug)}&order=recorded_at.desc&limit=${limit}`
  );
  return rows.reverse();
}

export async function getSubscriptionHistory(slug, limit = 300) {
  const rows = await get(
    "subscriptionHistory",
    `select=qib,nii,retail,total,recorded_at&slug=eq.${encodeURIComponent(slug)}&order=recorded_at.desc&limit=${limit}`
  );
  return rows.reverse();
}

/** Slugs for generateStaticParams and the sitemap. */
export async function getAllSlugs() {
  return get("ipos", "select=slug,updated_at&limit=1000");
}
