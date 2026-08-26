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
 * The next thing about to happen to this IPO: {text, urgent} or null.
 *
 * Every stage gets a countdown, not just the open one — an upcoming issue
 * counts down to its open date, a live one to its close, and a closed one to
 * its listing. Which date matters depends entirely on where the IPO is, so
 * reading a single date would be wrong for two thirds of the table.
 *
 * `urgent` marks the day it actually happens, which is the only one worth
 * colouring differently.
 */
export function timelineDays(ipo, today = istToday()) {
  if (!ipo) return null;
  const date = {
    upcoming: ipo.open_date,
    open: ipo.close_date,
    closed: ipo.listing_date,
  }[String(ipo.status || "").toLowerCase()];
  if (!date) return null;

  const days = daysUntil(date, today);
  // A date already past means the scraper has not caught up with the status
  // yet; showing "-2 days left" would be worse than showing nothing.
  return days == null || days < 0 ? null : days;
}

const TIMELINE_WORDS = {
  upcoming: {
    now: "Opens today",
    one: "Opens tomorrow",
    many: (n) => `Opens in ${n} days`,
  },
  open: {
    now: "Last day",
    one: "1 day left",
    many: (n) => `${n} days left`,
  },
  closed: {
    now: "Lists today",
    one: "Lists tomorrow",
    many: (n) => `Lists in ${n} days`,
  },
};

export function timelineLabel(ipo, today = istToday()) {
  const days = timelineDays(ipo, today);
  if (days == null) return null;
  const words = TIMELINE_WORDS[String(ipo.status || "").toLowerCase()];
  if (!words) return null;
  if (days === 0) return { text: words.now, urgent: true };
  return { text: days === 1 ? words.one : words.many(days), urgent: false };
}

/**
 * Issue size in ₹ crore: {value, exact} or null.
 *
 * The issuer's own wording is preferred because it is exact. Failing that we
 * derive it from shares x cap price, which lands close but not on the nose
 * (the real figure depends on the final cut-off price) — hence `exact`, so
 * the display can say so rather than presenting a guess as a fact.
 */
export function issueSizeCrore(ipo) {
  const match = String(ipo?.issue_size || "").match(
    /([\d,]+(?:\.\d+)?)\s*(million|billion|crore|lakh)/i
  );
  if (match) {
    const amount = Number(match[1].replace(/,/g, ""));
    const unit = match[2].toLowerCase();
    const crore =
      unit === "crore" ? amount
      : unit === "million" ? amount / 10
      : unit === "billion" ? amount * 100
      : amount / 100;
    if (Number.isFinite(crore) && crore > 0) return { value: crore, exact: true };
  }
  if (ipo?.issue_size_shares && ipo?.price_band_high) {
    const crore =
      (Number(ipo.issue_size_shares) * Number(ipo.price_band_high)) / 1e7;
    if (Number.isFinite(crore) && crore > 0) return { value: crore, exact: false };
  }
  return null;
}

export function fmtIssueSize(ipo) {
  const size = issueSizeCrore(ipo);
  if (!size) return "—";
  const rupees = `₹${size.value.toLocaleString("en-IN", {
    maximumFractionDigits: size.value >= 100 ? 0 : 1,
  })} Cr`;
  return size.exact ? rupees : `≈${rupees}`;
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
export function dailyLatest(history, fields = ["gmp"]) {
  const byDay = new Map();
  for (const point of history || []) {
    if (!point || !point.recorded_at) continue;
    // A snapshot counts if it carries any of the fields asked for. Requiring
    // all of them would drop a subscription row taken before the QIB book
    // opened, losing that whole day from the table.
    if (!fields.some((field) => point[field] != null)) continue;

    const date = istDateOf(point.recorded_at);
    const existing = byDay.get(date);
    if (existing && point.recorded_at <= existing.recorded_at) continue;

    const entry = { date, recorded_at: point.recorded_at };
    for (const field of fields) {
      entry[field] = point[field] == null ? null : Number(point[field]);
    }
    byDay.set(date, entry);
  }
  return [...byDay.values()].sort((a, b) => a.date.localeCompare(b.date));
}

/** The GMP series — one point per IST day. */
export function dailySeries(history) {
  return dailyLatest(history, ["gmp"]);
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
