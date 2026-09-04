"use client";

/**
 * The price of an issue that has listed: live, drawn, and readable bar by bar.
 *
 * FIVE TIMEFRAMES, TWO SOURCES. 5 min and 15 min are today's session, folded
 * out of NSE's one-minute ticks — one request, bucketed twice, so switching
 * between them costs nothing. 1 day, 1 week and 1 month come from the daily
 * bhavcopy we store ourselves, rolled up in the browser. NSE will answer for
 * longer ranges, but every point it returns beyond a single day is a bare
 * close with no open, high or low in it, and a close cannot make a candle.
 *
 * A timeframe with fewer than two candles behind it is shown disabled rather
 * than hidden, and says what it is waiting for. This site tracks issues that
 * listed days ago: a stock four sessions old has one calendar month of
 * history, and a "1 month" chart of it would be a single candle claiming to
 * describe a month that never happened. The button appears the day the
 * sessions to fill it exist.
 *
 * WHAT "LIVE" MEANS HERE, EXACTLY. The figure is NSE's last traded price,
 * fetched through our own server — never from the reader's browser to NSE
 * — and at most twice a minute per symbol however many people are looking.
 * Outside market hours the same figure is shown with "Market closed" and
 * NSE's own stamp for it, because a closed market has a last price and
 * pretending otherwise would leave the page blank for eighteen hours a day.
 *
 * Polling stops when the tab is hidden and when the market is shut. A
 * background tab asking every thirty seconds for a number nobody is looking
 * at is exactly the traffic the server-side cache exists to avoid.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { canDraw, groupBars } from "../../lib/bars";
import { fmtDate, inr } from "../../lib/format";
import CandleSvg from "./CandleSvg";

const POLL_MS = 30000;

const PHASE_TEXT = {
  open: "Live",
  "pre-open": "Pre-open",
  before: "Opens 9:15 AM IST",
  closed: "Market closed",
  weekend: "Market closed for the weekend",
};

function fmtIst(iso) {
  if (!iso) return null;
  return new Date(iso).toLocaleTimeString("en-IN", {
    timeZone: "Asia/Kolkata",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** "09:15" from an NSE bucket ms — IST encoded as UTC, read as UTC. */
function bucketLabel(ms) {
  const d = new Date(ms);
  return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
}

/** "Sept 2026" from a 'YYYY-MM' key. */
function monthLabel(key) {
  return new Date(`${key}-01T00:00:00Z`).toLocaleDateString("en-IN", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

export default function LiveChart({ symbol, name, daily }) {
  const [live, setLive] = useState(null);
  const [failed, setFailed] = useState(false);
  const [frameId, setFrameId] = useState("5m");
  const [hovered, setHovered] = useState(null);
  // Set once the first answer arrives, so the default is chosen from what
  // there actually is rather than from a guess made before asking.
  const decided = useRef(false);
  const timer = useRef(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/quote/${encodeURIComponent(symbol)}`, { cache: "no-store" });
      const body = await res.json();
      if (!body?.ok) {
        setFailed(true);
        return body;
      }
      setFailed(false);
      setLive(body);
      return body;
    } catch {
      setFailed(true);
      return null;
    }
  }, [symbol]);

  useEffect(() => {
    let alive = true;
    const tick = async () => {
      if (!alive) return;
      const body = await load();
      const trading = body?.phase === "open" || body?.phase === "pre-open";
      // Only keep asking while there is something new to hear.
      if (alive && trading && !document.hidden) {
        timer.current = setTimeout(tick, POLL_MS);
      }
    };
    const onVisible = () => {
      if (!document.hidden && !timer.current) tick();
    };
    tick();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      alive = false;
      clearTimeout(timer.current);
      timer.current = null;
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [load]);

  const phase = live?.phase;
  const trading = phase === "open" || phase === "pre-open";

  // Every timeframe, built once per new quote. The rollups are cheap, but
  // rebuilding them on a hover — which fires a hundred times a drag — would
  // not be.
  const frames = useMemo(() => {
    const intraday = (key) =>
      (live?.candles?.[key] || []).map((c) => ({ ...c, key: c.t }));
    const day = daily || [];
    const week = groupBars(day, "week");
    const month = groupBars(day, "month");

    const clock = (bar) => bucketLabel(bar.t);
    const date = (bar) => fmtDate(bar.d);
    // Why an intraday frame is empty is two different facts, and telling
    // someone their stock has not traded when really we could not reach the
    // exchange is the kind of wrong that costs trust in every other number
    // on the page.
    const noIntraday = failed
      ? "NSE did not answer — the daily series is our own record"
      : trading
        ? "No trades yet today"
        : "Today's candles appear once the market opens";

    return [
      {
        id: "5m",
        tab: "5 min",
        short: "5m",
        bars: intraday("5m"),
        label: clock,
        stamp: clock,
        baseline: live?.prevClose ?? undefined,
        foot: (n) =>
          `Five-minute candles from NSE's live ticks · ${n} ${trading ? "so far today" : "through today's close"}`,
        waiting: noIntraday,
      },
      {
        id: "15m",
        tab: "15 min",
        short: "15m",
        bars: intraday("15m"),
        label: clock,
        stamp: clock,
        baseline: live?.prevClose ?? undefined,
        foot: (n) =>
          `Fifteen-minute candles from NSE's live ticks · ${n} ${trading ? "so far today" : "through today's close"}`,
        waiting: noIntraday,
      },
      {
        id: "1d",
        tab: "1 day",
        short: "1D",
        bars: day,
        label: date,
        stamp: date,
        foot: (n) => `${n} trading days since listing · NSE end-of-day prices`,
        waiting: "Daily prices appear the evening after the first session",
      },
      {
        id: "1w",
        tab: "1 week",
        short: "1W",
        bars: week,
        label: date,
        stamp: (bar) =>
          `Week of ${fmtDate(bar.d)}${bar.sessions ? ` · ${bar.sessions} session${bar.sessions === 1 ? "" : "s"}` : ""}`,
        foot: (n) => `${n} weeks since listing · each candle folds that week's sessions`,
        waiting: "Needs a second trading week",
      },
      {
        id: "1mo",
        tab: "1 month",
        short: "1M",
        bars: month,
        label: (bar) => monthLabel(bar.key),
        stamp: (bar) =>
          `${monthLabel(bar.key)}${bar.sessions ? ` · ${bar.sessions} session${bar.sessions === 1 ? "" : "s"}` : ""}`,
        foot: (n) => `${n} months since listing · each candle folds that month's sessions`,
        waiting: "Needs a second calendar month",
      },
    ];
  }, [live, daily, trading, failed]);

  // The first answer decides the opening frame: today's five-minute candles
  // when the session has any, otherwise the daily series.
  useEffect(() => {
    if (!live || decided.current) return;
    decided.current = true;
    const five = frames.find((f) => f.id === "5m");
    if (!canDraw(five?.bars)) setFrameId("1d");
  }, [live, frames]);

  const wanted = frames.find((f) => f.id === frameId) || frames[0];
  // Never leave the reader looking at an empty frame: if what they picked
  // has emptied out (a reload before the first trade of the day), fall
  // through to the first frame that can actually be drawn.
  const frame = canDraw(wanted.bars) ? wanted : frames.find((f) => canDraw(f.bars)) || wanted;
  const bars = frame.bars;
  const drawable = canDraw(bars);
  const anyFrame = frames.some((f) => canDraw(f.bars));

  // The readout follows the pointer, and rests on the newest candle when
  // nothing is under it — so the row is informative before it is touched
  // rather than being four empty labels.
  const shown = drawable
    ? bars[Number.isInteger(hovered) && hovered >= 0 && hovered < bars.length ? hovered : bars.length - 1]
    : null;
  const reading = Number.isInteger(hovered);

  const change = live?.change;
  const tone = change > 0 ? "gmp-up" : change < 0 ? "gmp-down" : "gmp-flat";

  return (
    <div className="live">
      <div className="live-head">
        <div className="live-price">
          {live?.ltp != null ? (
            <>
              <span className="live-ltp">{inr(live.ltp)}</span>
              {change != null && (
                <span className={`live-change ${tone}`}>
                  {change > 0 ? "+" : ""}
                  {inr(Math.abs(change)).replace("₹", change < 0 ? "−₹" : "₹")}
                  {live.pct != null && (
                    <span className="live-pct">
                      {" "}({live.pct > 0 ? "+" : ""}
                      {Number(live.pct).toFixed(2)}%)
                    </span>
                  )}
                </span>
              )}
            </>
          ) : failed ? (
            <span className="live-ltp live-ltp-muted">Live price unavailable</span>
          ) : (
            <span className="live-ltp live-ltp-muted">Fetching…</span>
          )}
        </div>

        <p className="live-status">
          {live ? (
            <>
              <span className="live-dot" data-on={trading || undefined} aria-hidden="true" />
              {PHASE_TEXT[phase] || "—"}
              {live.updatedAt && (
                <>
                  {" · "}
                  {/* NSE's own stamp, and named as such: after the close
                      it is their end-of-day snapshot time, not the moment of
                      the last trade, and "last 4:00 pm" would imply the
                      wrong one of those. */}
                  {trading ? "as of" : "NSE updated"} {fmtIst(live.updatedAt)} IST
                </>
              )}
              {live.stale && " · NSE not responding, showing the last figure"}
            </>
          ) : failed ? (
            "NSE did not answer. The daily chart below is from our own records."
          ) : null}
        </p>
      </div>

      {live && (live.open != null || live.high != null) && (
        <dl className="live-ohl">
          {live.open != null && (
            <div><dt>Open</dt><dd>{inr(live.open)}</dd></div>
          )}
          {live.high != null && (
            <div><dt>High</dt><dd>{inr(live.high)}</dd></div>
          )}
          {live.low != null && (
            <div><dt>Low</dt><dd>{inr(live.low)}</dd></div>
          )}
          {live.prevClose != null && (
            <div><dt>Prev close</dt><dd>{inr(live.prevClose)}</dd></div>
          )}
          {live.volume != null && (
            <div><dt>Volume</dt><dd>{Number(live.volume).toLocaleString("en-IN")}</dd></div>
          )}
        </dl>
      )}

      {anyFrame && (
        <div className="live-tabs" role="tablist" aria-label="Candle timeframe">
          {frames.map((f) => {
            const ok = canDraw(f.bars);
            return (
              <button
                key={f.id}
                type="button"
                role="tab"
                className="tab tab-sm"
                data-active={frame.id === f.id}
                aria-selected={frame.id === f.id}
                disabled={!ok}
                title={ok ? undefined : f.waiting}
                onClick={() => {
                  setFrameId(f.id);
                  setHovered(null);
                }}
              >
                {/* Both labels ship; CSS shows whichever the width allows,
                    so five timeframes stay on one row on a phone instead of
                    wrapping into a second the scroll button then covers. */}
                <span className="tab-long">{f.tab}</span>
                <span className="tab-short" aria-hidden="true">{f.short}</span>
              </button>
            );
          })}
        </div>
      )}

      {drawable ? (
        <>
          {/* The OHLC readout for whichever candle is under the pointer, in
              HTML above the chart rather than a bubble floating over it: a
              bubble covers the very candles either side that give the one
              you are on its meaning, and on a phone it sits under your own
              thumb. */}
          <dl className="live-read" data-reading={reading || undefined} aria-live="off">
            <div className="live-read-when">
              <dt className="sr-only">Candle</dt>
              <dd>{frame.stamp(shown)}</dd>
            </div>
            <div><dt>O</dt><dd>{inr(shown.o)}</dd></div>
            <div><dt>H</dt><dd>{inr(shown.h)}</dd></div>
            <div><dt>L</dt><dd>{inr(shown.l)}</dd></div>
            <div>
              <dt>C</dt>
              <dd className={shown.c > shown.o ? "gmp-up" : shown.c < shown.o ? "gmp-down" : undefined}>
                {inr(shown.c)}
              </dd>
            </div>
          </dl>

          <CandleSvg
            className="live-svg"
            bars={bars}
            baseline={frame.baseline}
            hovered={hovered}
            onHover={setHovered}
            label={frame.label}
            title={(bar) =>
              `${frame.stamp(bar)} — O ${inr(bar.o)} H ${inr(bar.h)} L ${inr(bar.l)} C ${inr(bar.c)}`
            }
            ariaLabel={`${name}, ${frame.tab} candles: ${inr(bars[0].o)} at ${frame.stamp(
              bars[0]
            )} to ${inr(bars[bars.length - 1].c)} at ${frame.stamp(bars[bars.length - 1])}`}
          />
          <p className="subtitle live-foot">{frame.foot(bars.length)}</p>
        </>
      ) : (
        <p className="subtitle subtitle-flush">
          {daily?.length === 1
            ? "One trading day so far — a chart starts from the second."
            : "Daily prices appear once NSE publishes the day's closing data, which is in the evening."}
        </p>
      )}
    </div>
  );
}
