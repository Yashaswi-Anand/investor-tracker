/** Display formatting helpers — pure, shared by every component. */

/** IPOs are an Indian market, so every date and time is rendered in IST. */
export const IST_TIMEZONE = "Asia/Kolkata";

export const inr = (n) =>
  n == null ? "—" : `₹${Number(n).toLocaleString("en-IN")}`;

export const times = (n) => (n == null ? "—" : `${Number(n).toFixed(2)}x`);

export function fmtDate(d, withYear = false) {
  if (!d) return "—";
  // Parse as UTC midnight and print in UTC: the value is a calendar date with
  // no time component, so shifting it into any timezone can move it a day.
  return new Date(`${d}T00:00:00Z`).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
    ...(withYear ? { year: "numeric" } : {}),
  });
}

/** A real timestamp (not a calendar date) rendered in IST. */
export function fmtDateTime(value) {
  if (!value) return "—";
  return new Date(value).toLocaleString("en-IN", { timeZone: IST_TIMEZONE });
}

/** Clock time of a timestamp in IST, e.g. "2:24 pm". */
export function fmtTime(value) {
  if (!value) return "—";
  return new Date(value).toLocaleTimeString("en-IN", {
    timeZone: IST_TIMEZONE,
    hour: "numeric",
    minute: "2-digit",
  });
}

export function fmtShortDate(value) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("en-IN", {
    timeZone: IST_TIMEZONE,
    day: "numeric",
    month: "short",
  });
}

/**
 * Today's calendar date in IST as 'YYYY-MM-DD'.
 *
 * Using the server's UTC date would leave the day's milestones unmarked for
 * the first 5.5 hours of every Indian day.
 */
export function istToday() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: IST_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/**
 * Whole days from today (IST) until a calendar date; negative once it is past.
 *
 * Both sides are parsed as UTC midnight so the subtraction counts calendar
 * days rather than elapsed hours — otherwise a date could round to the wrong
 * day depending on when the page happened to render.
 */
export function daysUntil(date, today = istToday()) {
  if (!date) return null;
  const from = Date.parse(`${today}T00:00:00Z`);
  const to = Date.parse(`${date}T00:00:00Z`);
  if (Number.isNaN(from) || Number.isNaN(to)) return null;
  return Math.round((to - from) / 86400000);
}

/**
 * "Last day" / "2 days left" for an issue that is still accepting bids.
 *
 * Returns null for anything not currently open, so callers can render it
 * unconditionally without checking status themselves.
 */
export function closingLabel(ipo, today = istToday()) {
  if (!ipo || String(ipo.status || "").toLowerCase() !== "open") return null;
  const left = daysUntil(ipo.close_date, today);
  if (left == null || left < 0) return null;
  if (left === 0) return "Last day";
  return left === 1 ? "1 day left" : `${left} days left`;
}

/**
 * Serialise a JSON-LD object for embedding in a <script> tag.
 *
 * Company names come from a scraped source, so a literal '<' in the data
 * could close the script element early. Escaping the three characters that
 * matter keeps the JSON valid while making that impossible.
 */
export function safeJsonLd(data) {
  return JSON.stringify(data)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026");
}

/** IST calendar date ('YYYY-MM-DD') of any timestamp. */
export function istDateOf(value) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: IST_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value));
}

/**
 * Collapse 30-minute GMP snapshots into one point per IST day — the day's
 * last recorded value — sorted oldest first.
 *
 * The scraper writes ~48 rows a day per IPO; readers care about the
 * day-over-day movement, not every tick, so this is what the history table,
 * the trend bars and the dashboard delta are all built from.
 */
export function dailySeries(history) {
  const byDay = new Map();
  for (const point of history || []) {
    if (!point || point.gmp == null || !point.recorded_at) continue;
    const date = istDateOf(point.recorded_at);
    const existing = byDay.get(date);
    if (!existing || point.recorded_at > existing.recorded_at) {
      byDay.set(date, {
        date,
        gmp: Number(point.gmp),
        recorded_at: point.recorded_at,
      });
    }
  }
  return [...byDay.values()].sort((a, b) => a.date.localeCompare(b.date));
}

/** Signed rupee delta for display: "+₹12" / "−₹4" / null when flat or unknown. */
export function fmtDelta(delta) {
  if (delta == null || Number.isNaN(Number(delta)) || Number(delta) === 0) return null;
  const n = Number(delta);
  return `${n > 0 ? "+" : "−"}₹${Math.abs(n).toLocaleString("en-IN")}`;
}

export function priceBand(ipo) {
  if (ipo.price_band_low == null || ipo.price_band_high == null) return "—";
  if (ipo.price_band_low === ipo.price_band_high) return inr(ipo.price_band_high);
  return `${inr(ipo.price_band_low)} – ${inr(ipo.price_band_high)}`;
}

/** GMP as a % of the upper price band. */
export function gmpPercent(ipo) {
  if (ipo.gmp == null || !ipo.price_band_high) return null;
  return (ipo.gmp / ipo.price_band_high) * 100;
}

export const STATUS_LABEL = {
  open: "Open",
  upcoming: "Upcoming",
  closed: "Closed",
  listed: "Listed",
};
