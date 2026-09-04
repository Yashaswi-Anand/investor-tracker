/**
 * Turning stored prices into the bars a chart draws.
 *
 * All of it is pure and none of it touches the network, so the daily series
 * can be shaped on the server and handed to the client as plain numbers,
 * and the weekly and monthly rollups can happen in the browser when someone
 * actually asks for them.
 *
 * WHY THE ROLLUPS COME FROM OUR OWN RECORDS AND NOT FROM NSE. Their chart
 * endpoint will answer for 1W, 1M, 1Y and 5Y, but every point it returns
 * over a range longer than a day is a single close — [ms, price, "NM",
 * null, null] — with no open, high or low anywhere in it. You cannot build
 * a candle out of a close. The daily bhavcopy we already store does carry
 * real OHLC per session, so a week is built by folding those: the week's
 * open is its first session's open, its close is its last session's close,
 * and its high and low are the extremes across every session in between.
 */

/** Stored bars → drawable bars, sorted oldest first. */
export function dailyBars(ipo) {
  const raw = ((ipo?.details || {}).prices || []).filter(
    (b) => b && b.d && Number.isFinite(Number(b.c))
  );
  return raw
    .map((b) => ({
      key: b.d,
      d: b.d,
      o: Number(b.o ?? b.c),
      h: Number(b.h ?? b.c),
      l: Number(b.l ?? b.c),
      c: Number(b.c),
      v: Number(b.v || 0),
    }))
    .filter((b) => [b.o, b.h, b.l, b.c].every(Number.isFinite))
    .sort((a, b) => (a.d < b.d ? -1 : 1));
}

/** The Monday of the ISO week an ISO date falls in, as 'YYYY-MM-DD'. */
export function weekStart(iso) {
  const d = new Date(`${iso}T00:00:00Z`);
  // getUTCDay is 0 on Sunday; shift so Monday starts the week, which is how
  // an Indian trading week reads — Monday to Friday, one block.
  const back = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - back);
  return d.toISOString().slice(0, 10);
}

/**
 * Daily bars folded into weeks or months.
 *
 * The last period is included while it is still running — a week you are
 * three days into is a real candle, just an unfinished one, and hiding it
 * would leave the chart ending days behind the price printed above it.
 * `partial` marks it so the caller can say so rather than implying the
 * period closed there.
 */
export function groupBars(bars, period) {
  if (!Array.isArray(bars) || !bars.length) return [];
  const keyOf = period === "month" ? (b) => b.d.slice(0, 7) : (b) => weekStart(b.d);

  const out = [];
  for (const bar of bars) {
    const key = keyOf(bar);
    const last = out[out.length - 1];
    if (!last || last.key !== key) {
      out.push({
        key,
        d: bar.d, // the first session in the period, for the axis label
        end: bar.d,
        o: bar.o,
        h: bar.h,
        l: bar.l,
        c: bar.c,
        v: bar.v || 0,
        sessions: 1,
      });
      continue;
    }
    last.h = Math.max(last.h, bar.h);
    last.l = Math.min(last.l, bar.l);
    last.c = bar.c; // the period closes wherever its last session closed
    last.end = bar.d;
    last.v += bar.v || 0;
    last.sessions += 1;
  }
  return out;
}

/**
 * Whether a rollup is worth offering.
 *
 * Two candles is the floor for a chart — one is a lone rectangle that says
 * nothing about direction. On a site tracking issues that listed days ago
 * this matters more than it sounds: an IPO four sessions old has exactly
 * one calendar month behind it, and a "1 month" chart of it would be a
 * single candle claiming to describe a month of trading that never
 * happened. The button stays visibly present and disabled until the
 * sessions to fill it exist.
 */
export function canDraw(bars) {
  return Array.isArray(bars) && bars.length >= 2;
}
