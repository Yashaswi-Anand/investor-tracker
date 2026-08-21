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
