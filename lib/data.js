/**
 * Data access. All reads go through the Supabase REST API with the anon key
 * (RLS allows SELECT only).
 *
 * Reads are deliberately UNCACHED (`cache: "no-store"`). This is a live
 * tracker: the scraper writes hourly and readers expect the
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
import { dailySeries, istToday, minInvestment, timelineDays } from "./format";

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

  // Recomputed rather than read, for the same reason as the estimate below:
  // a row that left NSE's set stopped being re-derived and kept whatever it
  // was last given. Every SME issue was carrying a one-lot minimum from
  // before the rule was two, and no scrape would ever have corrected the
  // ones that have already listed. Derived here, the page is right the
  // moment this ships.
  //
  // A lock is the one thing that wins. `locked` is how a human says "I have
  // checked this one myself", and silently recomputing over that would make
  // the escape hatch useless.
  const locked = Array.isArray(out.locked) ? out.locked : [];
  if (!locked.includes("min_investment")) {
    const smallest = minInvestment(out);
    if (smallest != null) out.min_investment = smallest;
  }
  // Always recomputed, never read from the stored column, because the two can
  // disagree and the page is where that shows. An IPO leaves NSE's set once
  // bidding closes, so the scraper stops deriving for it; whatever estimate
  // was last written then freezes, and a later correction to the price band
  // leaves an estimate that no longer matches its own inputs — the table
  // showed "▲ ₹43 → ₹98" against a ₹53 band. Derived here, the arrow cannot
  // contradict the two numbers either side of it whatever the scraper did.
  if (out.gmp != null && out.price_band_high) {
    out.estimated_listing =
      Math.round((Number(out.price_band_high) + Number(out.gmp)) * 100) / 100;
  }
  return out;
}

const ORDER = { open: 0, upcoming: 1, allotment: 2, closed: 3, listed: 4 };

/**
 * The two groups that read newest-first, and the date each is newest by.
 *
 * A countdown is the right order while something is still ahead of you. Once
 * allotment is out, or the issue has listed, the question changes from "what
 * happens next" to "what just happened" — and the answer to that is the most
 * recent one, at the top. Everything else keeps the countdown.
 */
const NEWEST_FIRST = { allotment: "allotment_date", listed: "listing_date" };

/**
 * Every IPO, sorted so live issues appear first and, within each group, the
 * most imminent milestone comes first.
 *
 * The second part is what the countdown column shows: an issue closing
 * tomorrow matters more than one closing next week, one opening tomorrow
 * more than one opening on Friday, and one listing tomorrow more than one
 * listing next month. Sorting by open_date instead put "2 days left" above
 * "1 day left", which reads backwards next to the countdown beside it.
 *
 * Allotment and listed issues are the exception: they are ordered by their
 * own milestone date, newest first, because for those the interesting one is
 * the one that just happened rather than the one furthest along.
 *
 * Anything else with no countdown left — closed issues whose listing date we
 * do not have — falls back to most-recent-first by open date.
 */
export async function getAllIpos() {
  const rows = await get("ipos", "select=*&order=open_date.desc.nullslast&limit=500");
  const today = istToday();

  return rows.map(enrich).sort((a, b) => {
    const byStatus = (ORDER[a.status] ?? 9) - (ORDER[b.status] ?? 9);
    if (byStatus !== 0) return byStatus;

    // Same status, and it is one of the two that reads newest-first.
    const dateField = NEWEST_FIRST[a.status];
    if (dateField) {
      const aOwn = String(a[dateField] || "");
      const bOwn = String(b[dateField] || "");
      // A missing date sinks rather than sorting as the oldest possible.
      if (aOwn && !bOwn) return -1;
      if (!aOwn && bOwn) return 1;
      if (aOwn !== bOwn) return bOwn.localeCompare(aOwn);
    }

    const aDays = timelineDays(a, today);
    const bDays = timelineDays(b, today);
    if (aDays != null && bDays != null) {
      if (aDays !== bDays) return aDays - bDays;
    } else if (aDays != null) {
      return -1; // a still has something coming; b does not
    } else if (bDays != null) {
      return 1;
    }

    const aDate = String(a.open_date || "");
    const bDate = String(b.open_date || "");
    if (aDate !== bDate) return bDate.localeCompare(aDate);

    return String(a.short_name || a.name || "").localeCompare(
      String(b.short_name || b.name || "")
    );
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
 * row. 3000 rows ≈ 60 IPOs × 24 snapshots/day, i.e. comfortably more than
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
 * actually look for — rather than flickering on every hourly tick.
 */
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
