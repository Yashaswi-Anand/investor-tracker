/**
 * Data access. All reads go through the Supabase REST API with the anon key
 * (RLS allows SELECT only).
 *
 * Reads are deliberately UNCACHED (`cache: "no-store"`). This is a live
 * tracker: the scraper writes every 30 minutes and readers expect the
 * latest GMP on every load. With ISR, low traffic + stale-while-revalidate
 * meant a page could keep serving a 10-minute-old render, and separate
 * server instances each held their own copy — so a reload could flip
 * between old and new values. Supabase sits in Mumbai and answers in tens
 * of milliseconds, so per-request reads are cheap and always consistent.
 *
 * Every function fails soft — a missing database returns an empty result and
 * the page renders its empty state rather than crashing the build.
 */

import { isConfigured, supabaseHeaders, supabaseUrl } from "./config";
import { dailySeries } from "./format";

async function get(endpointKey, query) {
  if (!isConfigured()) return [];
  try {
    const res = await fetch(`${supabaseUrl(endpointKey)}?${query}`, {
      headers: supabaseHeaders(),
      cache: "no-store",
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

/**
 * Most recent GMP snapshots across ALL IPOs — one query that lets the
 * dashboard show each IPO's day-over-day GMP change without a request per
 * row. 3000 rows ≈ 60 IPOs × 48 snapshots/day, i.e. comfortably more than
 * the two days we need.
 */
export async function getRecentGmpSnapshots(limit = 3000) {
  // Only the last few days are needed for a day-over-day delta; the time
  // filter keeps this query small now that it runs on every request.
  const since = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
  return get(
    "gmpHistory",
    `select=slug,gmp,recorded_at&recorded_at=gte.${encodeURIComponent(since)}&order=recorded_at.desc&limit=${limit}`
  );
}

/**
 * {slug: {latest, previous, delta}} built from snapshots.
 *
 * `delta` compares today's last value with the previous day's last value,
 * so it reads "GMP moved +₹12 since yesterday" — the number IPO readers
 * actually look for — rather than flickering on every 30-minute tick.
 */
/**
 * When the scraper last wrote to the database, as an ISO string.
 *
 * Every run upserts every IPO, and a Postgres trigger stamps `updated_at`
 * on each write — so the newest `updated_at` across all rows IS the last
 * successful run, whether or not any value actually changed. That is what
 * readers want to see: proof the data is being refreshed.
 */
export function lastUpdatedAt(ipos) {
  let latest = "";
  for (const ipo of ipos || []) {
    if (ipo && ipo.updated_at && ipo.updated_at > latest) latest = ipo.updated_at;
  }
  return latest || null;
}

/**
 * {slug: [gmp, gmp, ...]} — each IPO's recent snapshots oldest→newest,
 * thinned to at most `max` points. Feeds the dashboard sparklines.
 */
export function gmpSparklines(snapshots, max = 36) {
  const bySlug = new Map();
  for (const row of snapshots || []) {
    if (!row || !row.slug || row.gmp == null) continue;
    if (!bySlug.has(row.slug)) bySlug.set(row.slug, []);
    bySlug.get(row.slug).push(row);
  }
  const out = {};
  for (const [slug, rows] of bySlug) {
    const asc = rows
      .slice()
      .sort((a, b) => String(a.recorded_at).localeCompare(String(b.recorded_at)))
      .map((r) => Number(r.gmp));
    const step = Math.max(1, Math.ceil(asc.length / max));
    out[slug] = asc.filter((_, i) => i % step === 0 || i === asc.length - 1);
  }
  return out;
}

export function gmpDeltas(snapshots) {
  const bySlug = new Map();
  for (const row of snapshots || []) {
    if (!row || !row.slug) continue;
    if (!bySlug.has(row.slug)) bySlug.set(row.slug, []);
    bySlug.get(row.slug).push(row);
  }
  const out = {};
  for (const [slug, rows] of bySlug) {
    const days = dailySeries(rows);
    if (!days.length) continue;
    const latest = days[days.length - 1];
    const previous = days.length > 1 ? days[days.length - 2] : null;
    out[slug] = {
      latest: latest.gmp,
      previous: previous ? previous.gmp : null,
      delta: previous ? Number((latest.gmp - previous.gmp).toFixed(2)) : null,
    };
  }
  return out;
}
