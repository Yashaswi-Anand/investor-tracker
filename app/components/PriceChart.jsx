import { fmtDate, inr } from "../../lib/format";
import CandleSvg from "./CandleSvg";
import Reveal from "./Reveal";

/**
 * Daily candles for an IPO that has already listed.
 *
 * Bars come from `details.prices` — NSE's own end-of-day bhavcopy, the same
 * file the listing price is read from. Open, high, low and close are real
 * traded prices. The drawing itself is CandleSvg, shared with the intraday
 * chart; this component's job is to turn stored bars into that shape and to
 * say, above the chart, what the window adds up to.
 */

/** Stored bars → drawable bars. Exported so the live chart's "Daily" view
 *  can draw the same series without re-deriving it. */
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

export default function PriceChart({ ipo }) {
  const bars = dailyBars(ipo);
  if (bars.length < 2) return null;

  const first = bars[0];
  const last = bars[bars.length - 1];
  const move = ((last.c - first.o) / first.o) * 100;

  return (
    <Reveal className="price-chart-wrap">
      <p className="subtitle price-caption">
        {bars.length} trading {bars.length === 1 ? "day" : "days"} since listing
        {" · "}
        <strong className={move > 0 ? "gmp-up" : move < 0 ? "gmp-down" : "gmp-flat"}>
          {move > 0 ? "+" : ""}
          {move.toFixed(1)}%
        </strong>{" "}
        over the window · close {inr(last.c)}
      </p>

      <CandleSvg
        bars={bars}
        label={(bar) => fmtDate(bar.d)}
        title={(bar) => `${fmtDate(bar.d)} — O ${inr(bar.o)} H ${inr(bar.h)} L ${inr(bar.l)} C ${inr(bar.c)}`}
        ariaLabel={`${ipo.name} daily price since listing: ${inr(first.o)} on ${fmtDate(
          first.d
        )} to ${inr(last.c)} on ${fmtDate(last.d)}`}
      />
    </Reveal>
  );
}
