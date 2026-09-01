import { fmtDate, inr } from "../../lib/format";
import Reveal from "./Reveal";

/**
 * Daily candles for an IPO that has already listed.
 *
 * Server-rendered inline SVG, like every other chart here. A candlestick
 * library would be many times the weight of this whole page for what is
 * fundamentally a rectangle and two lines per day.
 *
 * Bars come from `details.prices` — NSE's own end-of-day bhavcopy, the same
 * file the listing price is read from. Open, high, low and close are real
 * traded prices, so the axis is scaled to the actual high and low across the
 * window rather than from zero: on a price series, zero is not a meaningful
 * floor and starting there would flatten every candle into a smear at the top.
 * That is the opposite of the rule for the financial bars, and for the same
 * reason — the baseline should be whatever makes the shape honest.
 */

const W = 640;
const H = 240;
const PAD = { top: 16, right: 14, bottom: 30, left: 54 };

/** Three round-ish ticks across the range. */
function ticks(lo, hi) {
  const mid = (lo + hi) / 2;
  const round = (v) => (hi - lo >= 20 ? Math.round(v) : Math.round(v * 10) / 10);
  return [round(lo), round(mid), round(hi)];
}

export default function PriceChart({ ipo }) {
  const raw = ((ipo.details || {}).prices || []).filter(
    (b) => b && b.d && Number.isFinite(Number(b.c))
  );
  if (raw.length < 2) return null;

  const bars = raw
    .map((b) => ({
      d: b.d,
      o: Number(b.o ?? b.c),
      h: Number(b.h ?? b.c),
      l: Number(b.l ?? b.c),
      c: Number(b.c),
      v: Number(b.v || 0),
    }))
    .filter((b) => [b.o, b.h, b.l, b.c].every(Number.isFinite))
    .sort((a, b) => (a.d < b.d ? -1 : 1));
  if (bars.length < 2) return null;

  let lo = Math.min(...bars.map((b) => b.l));
  let hi = Math.max(...bars.map((b) => b.h));
  if (lo === hi) {
    lo -= 1;
    hi += 1;
  }
  // A little air so the extreme candles are not welded to the frame.
  const pad = (hi - lo) * 0.08;
  lo -= pad;
  hi += pad;

  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;
  const step = plotW / bars.length;
  const bodyW = Math.max(2, Math.min(13, step * 0.62));

  const x = (i) => PAD.left + step * (i + 0.5);
  const y = (v) => PAD.top + plotH - ((v - lo) / (hi - lo)) * plotH;

  const first = bars[0];
  const last = bars[bars.length - 1];
  const move = ((last.c - first.o) / first.o) * 100;

  // Every candle when there are few, else four spread evenly.
  const tickEvery = bars.length <= 6 ? 1 : Math.ceil(bars.length / 4);

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

      <svg
        className="chart price-chart"
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={`${ipo.name} daily price since listing: ${inr(first.o)} on ${fmtDate(
          first.d
        )} to ${inr(last.c)} on ${fmtDate(last.d)}`}
      >
        {ticks(lo, hi).map((value) => (
          <g key={value}>
            <line className="gmp-grid" x1={PAD.left} x2={W - PAD.right} y1={y(value)} y2={y(value)} />
            <text className="gmp-axis" x={PAD.left - 8} y={y(value) + 4} textAnchor="end">
              {`₹${value}`}
            </text>
          </g>
        ))}

        {bars.map((bar, i) => {
          const up = bar.c >= bar.o;
          const top = y(Math.max(bar.o, bar.c));
          const bottom = y(Math.min(bar.o, bar.c));
          return (
            <g
              key={bar.d}
              className="candle"
              data-up={up}
              /* Position in the series, so the candles can appear left to
                 right as the eye reads them. */
              style={{ "--i": bars.length > 1 ? i / (bars.length - 1) : 0 }}
            >
              <line className="candle-wick" x1={x(i)} x2={x(i)} y1={y(bar.h)} y2={y(bar.l)} />
              <rect
                className="candle-body"
                x={x(i) - bodyW / 2}
                y={top}
                width={bodyW}
                /* A doji closes where it opened; without a floor it would
                   vanish entirely and read as a missing day. */
                height={Math.max(1.5, bottom - top)}
                rx={1}
              />
              <title>
                {`${fmtDate(bar.d)} — O ${inr(bar.o)} H ${inr(bar.h)} L ${inr(bar.l)} C ${inr(bar.c)}`}
              </title>
            </g>
          );
        })}

        {bars.map((bar, i) =>
          i % tickEvery === 0 || i === bars.length - 1 ? (
            <text
              key={`t-${bar.d}`}
              className="gmp-axis"
              x={x(i)}
              y={H - 10}
              textAnchor="middle"
            >
              {fmtDate(bar.d)}
            </text>
          ) : null
        )}
      </svg>
    </Reveal>
  );
}
