/**
 * NSE's live quote and intraday chart, for issues that have listed.
 *
 * Server-side only. This module holds a cookie jar and talks to nseindia.com
 * directly; it must never be imported from a client component, because that
 * would put NSE's session dance — and NSE's rate limits — in every reader's
 * browser instead of in one place we control.
 *
 * WHAT NSE HANDS BACK, AND HOW IT IS READ
 *
 * getSymbolData returns { equityResponse: [ { tradeInfo, metaData, ... } ] }
 * — a list, first element. The last traded price is tradeInfo.lastPrice;
 * open, day high/low, previous close and the change are on metaData; the
 * time is a top-level "04-Sep-2026 12:52:38" string in IST. metaData also
 * carries `identifier` — symbol + series + market type, e.g. SKYWAYSEQN —
 * which is exactly the string getSymbolChartData wants, so the chart call
 * never has to build one.
 *
 * getSymbolChartData with days=1D returns grapthData (sic): one point about
 * every minute, each [ms, price, session, change, pct]. Session is "PO" for
 * the pre-open auction and "NM" for the normal market; the pre-open points
 * can carry a price of 0 before the first match. Only NM points with a real
 * price become candles.
 *
 * THE TIMESTAMPS ARE NOT UTC. NSE encodes Indian wall-clock time in the
 * epoch as if it were UTC — the first point of the day sits at 09:00 "UTC",
 * which is when NSE's pre-open starts, in Mumbai. Their own chart sets
 * useUTC:true and displays the raw value for the same reason. So every ms
 * here is read with getUTC* and never shifted; shift it and 09:15 becomes
 * 14:45.
 */

import { NSE } from "./config";

// ---------------------------------------------------------------- session ---

let jar = { cookie: "", at: 0 };

/** Cookie header from a warmed session, re-seeding when it is stale. */
async function cookieHeader() {
  const age = (Date.now() - jar.at) / 1000;
  if (jar.cookie && age < NSE.sessionSeconds) return jar.cookie;

  const res = await fetch(NSE.baseUrl + NSE.seedPath, {
    headers: { ...NSE.headers, Accept: "text/html,*/*" },
    cache: "no-store",
    signal: AbortSignal.timeout(NSE.timeoutMs),
    redirect: "follow",
  });
  // Node's fetch exposes every Set-Cookie through getSetCookie; the pair
  // NSE cares about (nsit, nseappid) is among them. Keep only name=value.
  const cookies = (res.headers.getSetCookie?.() || [])
    .map((c) => c.split(";")[0].trim())
    .filter(Boolean);
  jar = { cookie: cookies.join("; "), at: Date.now() };
  return jar.cookie;
}

async function call(fn, params) {
  const query = new URLSearchParams({ functionName: fn, ...params });
  const url = `${NSE.baseUrl}${NSE.api}?${query.toString()}`;
  const res = await fetch(url, {
    headers: { ...NSE.headers, Cookie: await cookieHeader() },
    cache: "no-store",
    signal: AbortSignal.timeout(NSE.timeoutMs),
  });
  if (!res.ok) {
    // A 403 usually means the session went stale; drop it so the next call
    // seeds again rather than failing the same way for ten minutes.
    if (res.status === 401 || res.status === 403) jar = { cookie: "", at: 0 };
    throw new Error(`NSE ${fn} ${res.status}`);
  }
  return res.json();
}

// ---------------------------------------------------------------- market ---

/** Minutes since midnight IST, and the IST weekday, right now. */
export function istNow(now = Date.now()) {
  // Shift to IST, then read as UTC: the same trick NSE plays, used once,
  // deliberately, and only for the clock.
  const d = new Date(now + 5.5 * 60 * 60 * 1000);
  return {
    minutes: d.getUTCHours() * 60 + d.getUTCMinutes(),
    weekday: d.getUTCDay(), // 0 Sunday … 6 Saturday
    date: d.toISOString().slice(0, 10),
  };
}

const PRE_OPEN = 9 * 60; // 09:00
const OPEN = 9 * 60 + 15; // 09:15
const CLOSE = 15 * 60 + 30; // 15:30

/**
 * Where the trading day stands, from the clock alone.
 *
 * Holidays are not known here — an exchange holiday on a weekday reads as
 * "open" until NSE returns no trades, at which point the route reports that
 * instead. Getting a holiday calendar wrong silently would be worse than
 * saying "no trades yet" on Diwali.
 */
export function marketPhase(now = Date.now()) {
  const { minutes, weekday } = istNow(now);
  if (weekday === 0 || weekday === 6) return "weekend";
  if (minutes < PRE_OPEN) return "before";
  if (minutes < OPEN) return "pre-open";
  if (minutes < CLOSE) return "open";
  return "closed";
}

// --------------------------------------------------------------- candles ---

const FIVE_MIN = 5 * 60 * 1000;

/**
 * One-minute ticks into five-minute OHLC bars.
 *
 * Only normal-market points with a real price count; the pre-open auction is
 * a different mechanism and its zero placeholders would print as a crash to
 * ₹0. Ticks carry no volume, so the bars carry none either — a made-up
 * volume would be worse than an absent one.
 *
 * The series is also cut at the 15:30 close. NSE's 1D data runs on into the
 * closing session, whose single print can sit a rupee or two away from the
 * last traded price — and the last traded price is the figure printed above
 * this chart. A last candle that disagreed with the number over it would
 * read as a bug, so the candles stop where continuous trading stops.
 */
export function toFiveMinuteCandles(points) {
  const buckets = new Map();
  for (const p of points || []) {
    if (!Array.isArray(p) || p.length < 2) continue;
    const ms = Number(p[0]);
    const price = Number(p[1]);
    const session = p[2];
    if (!Number.isFinite(ms) || !Number.isFinite(price) || price <= 0) continue;
    if (session && session !== "NM") continue;
    // ms is IST wall-clock encoded as UTC, so this is the IST minute of day.
    const at = new Date(ms);
    const minute = at.getUTCHours() * 60 + at.getUTCMinutes();
    if (minute < OPEN || minute > CLOSE) continue;
    const key = Math.floor(ms / FIVE_MIN) * FIVE_MIN;
    const b = buckets.get(key);
    if (!b) buckets.set(key, { t: key, o: price, h: price, l: price, c: price, n: 1 });
    else {
      b.h = Math.max(b.h, price);
      b.l = Math.min(b.l, price);
      b.c = price;
      b.n += 1;
    }
  }
  return [...buckets.values()].sort((a, b) => a.t - b.t);
}

/** "09:15" from an NSE ms value — read as UTC on purpose, see the header. */
export function istLabel(ms) {
  const d = new Date(ms);
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

// ------------------------------------------------------------------ quote ---

/** "04-Sep-2026 12:52:38" (IST) → ISO string with the +05:30 offset. */
function parseNseTime(text) {
  const m = /^(\d{2})-([A-Za-z]{3})-(\d{4}) (\d{2}):(\d{2}):(\d{2})$/.exec(text || "");
  if (!m) return null;
  const months = { Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11 };
  const mon = months[m[2]];
  if (mon == null) return null;
  const local = Date.UTC(+m[3], mon, +m[1], +m[4], +m[5], +m[6]);
  return new Date(local - 5.5 * 60 * 60 * 1000).toISOString();
}

const num = (v) => (v == null || v === "" ? null : Number.isFinite(Number(v)) ? Number(v) : null);

/**
 * The series NSE trades a symbol under.
 *
 * Mainboard issues are EQ. SME issues are ST or SM depending on the platform
 * they listed on, and the only way to know which is to ask; the board is
 * used only to order the guesses when asking fails.
 */
async function resolveSeries(symbol, board) {
  try {
    const meta = await call(NSE.functions.meta, { symbol });
    const active = Array.isArray(meta?.activeSeries) ? meta.activeSeries : [];
    if (active.includes("EQ")) return "EQ";
    if (active.length) return active[0];
  } catch {
    /* fall through to the guess */
  }
  return /sme/i.test(board || "") ? "ST" : "EQ";
}

/**
 * Everything the page shows for a listed symbol, from two NSE calls.
 *
 * Throws on any upstream failure; the route turns that into a calm
 * { ok: false } rather than a 500, because the daily chart underneath still
 * works and a dead quote must not take the page down with it.
 */
export async function fetchLive(symbol, board) {
  const series = await resolveSeries(symbol, board);
  const q = await call(NSE.functions.quote, {
    marketType: NSE.marketType,
    series,
    symbol,
  });
  const er = Array.isArray(q?.equityResponse) ? q.equityResponse[0] : null;
  if (!er) throw new Error("NSE returned no equityResponse");

  const md = er.metaData || {};
  const ti = er.tradeInfo || {};
  const identifier = md.identifier || `${symbol}${series}${NSE.marketType}`;

  const chart = await call(NSE.functions.chart, { symbol: identifier, days: "1D" });
  const candles = toFiveMinuteCandles(chart?.grapthData);

  return {
    symbol,
    series,
    identifier,
    ltp: num(ti.lastPrice),
    change: num(md.change),
    pct: num(md.pChange),
    open: num(md.open),
    high: num(md.dayHigh),
    low: num(md.dayLow),
    prevClose: num(md.previousClose) ?? num(chart?.closePrice),
    volume: num(ti.totalTradedVolume),
    updatedAt: parseNseTime(er.lastUpdateTime),
    status: md.symbolStatus || null,
    candles,
  };
}
