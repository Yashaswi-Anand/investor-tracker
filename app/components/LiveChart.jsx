"use client";

/**
 * The price of an issue that has listed: live, and drawn.
 *
 * Two views of one stock. TODAY is five-minute candles from NSE's live ticks,
 * with the last traded price above them, refreshed every half minute while
 * the market trades. DAILY is one candle per session since listing, from
 * NSE's end-of-day file, rendered on the server and handed in as props.
 * Today is the default whenever there is a today to show; on a weekend, a
 * holiday, or before the first trade it falls back to Daily and says why.
 *
 * WHAT "LIVE" MEANS HERE, EXACTLY. The figure is NSE's last traded price,
 * fetched through our own server — never from the reader's browser to NSE
 * — and at most twice a minute per symbol however many people are looking.
 * The time beside it is NSE's own stamp for that price, in IST. Outside
 * market hours the same figure is shown with "Market closed" and the time
 * it was last true, because a closed market has a last price and pretending
 * otherwise would leave the page blank for eighteen hours a day.
 *
 * Polling stops when the tab is hidden and when the market is shut. A
 * background tab asking every thirty seconds for a number nobody is looking
 * at is exactly the traffic the server-side cache exists to avoid.
 */

import { useCallback, useEffect, useRef, useState } from "react";
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

export default function LiveChart({ symbol, name, daily }) {
  const [live, setLive] = useState(null);
  const [failed, setFailed] = useState(false);
  const [view, setView] = useState("today");
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
      if (!decided.current) {
        decided.current = true;
        setView(body.candles?.length >= 2 ? "today" : "daily");
      }
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

  const candles = (live?.candles || []).map((c) => ({ ...c, key: c.t }));
  const hasToday = candles.length >= 2;
  const hasDaily = (daily || []).length >= 2;
  const showing = view === "today" && hasToday ? "today" : "daily";

  const change = live?.change;
  const tone = change > 0 ? "gmp-up" : change < 0 ? "gmp-down" : "gmp-flat";
  const phase = live?.phase;
  const trading = phase === "open" || phase === "pre-open";

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

      {(hasToday || hasDaily) && (
        <div className="live-tabs" role="tablist" aria-label="Chart range">
          <button
            type="button"
            role="tab"
            className="tab tab-sm"
            data-active={showing === "today"}
            aria-selected={showing === "today"}
            disabled={!hasToday}
            onClick={() => setView("today")}
          >
            Today · 5 min
          </button>
          <button
            type="button"
            role="tab"
            className="tab tab-sm"
            data-active={showing === "daily"}
            aria-selected={showing === "daily"}
            disabled={!hasDaily}
            onClick={() => setView("daily")}
          >
            Daily since listing
          </button>
        </div>
      )}

      {showing === "today" ? (
        <>
          <CandleSvg
            className="live-svg"
            bars={candles}
            baseline={live?.prevClose ?? undefined}
            label={(bar) => bucketLabel(bar.t)}
            title={(bar) =>
              `${bucketLabel(bar.t)} — O ${inr(bar.o)} H ${inr(bar.h)} L ${inr(bar.l)} C ${inr(bar.c)}`
            }
            ariaLabel={`${name} today, five-minute candles: ${inr(candles[0].o)} at ${bucketLabel(
              candles[0].t
            )} to ${inr(candles[candles.length - 1].c)} at ${bucketLabel(candles[candles.length - 1].t)} IST`}
          />
          <p className="subtitle live-foot">
            Five-minute candles from NSE&apos;s live ticks · {candles.length}{" "}
            {trading ? "so far today" : "through today's close"}
          </p>
        </>
      ) : hasDaily ? (
        <>
          <CandleSvg
            className="live-svg"
            bars={daily}
            label={(bar) => fmtDate(bar.d)}
            title={(bar) =>
              `${fmtDate(bar.d)} — O ${inr(bar.o)} H ${inr(bar.h)} L ${inr(bar.l)} C ${inr(bar.c)}`
            }
            ariaLabel={`${name} daily price since listing`}
          />
          <p className="subtitle live-foot">
            {daily.length} trading days since listing · NSE end-of-day prices
            {live && !hasToday && trading && " · no trades yet today"}
            {live && !hasToday && !trading && " · today's candles appear once the market opens"}
          </p>
        </>
      ) : (
        <p className="subtitle subtitle-flush">
          {daily?.length === 1
            ? "One trading day so far — the daily chart starts from the second."
            : "Daily prices appear once NSE publishes the day's closing data, which is in the evening."}
        </p>
      )}
    </div>
  );
}
