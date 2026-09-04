import { inr } from "../../lib/format";

/**
 * A candlestick chart as inline SVG, and nothing else.
 *
 * Shared by the daily chart (one candle a day, from NSE's bhavcopy) and the
 * intraday one (one every five minutes, from NSE's live ticks). It knows
 * nothing about where the bars came from or what the page says around them:
 * it is handed bars, a way to label each one, and an accessible summary, and
 * it draws. A candlestick library would be many times the weight of the
 * page for what is a rectangle and two lines per bar.
 *
 * The price axis is scaled to the actual low and high across the window, not
 * from zero: on a price series zero is not a meaningful floor, and starting
 * there would flatten every candle into a smear at the top. That is the
 * opposite of the rule for the financial bars, and for the same reason —
 * the baseline should be whatever makes the shape honest.
 *
 * Server-safe: no hooks, no state. The daily chart renders it on the server;
 * the live one renders it in the browser. Same component either way.
 */

export const CANDLE_W = 640;
export const CANDLE_H = 240;
const PAD = { top: 16, right: 14, bottom: 30, left: 54 };

/** Three round-ish ticks across the range. */
function ticks(lo, hi) {
  const mid = (lo + hi) / 2;
  const round = (v) => (hi - lo >= 20 ? Math.round(v) : Math.round(v * 10) / 10);
  return [round(lo), round(mid), round(hi)];
}

/**
 * @param bars      [{ key, o, h, l, c }] in display order, at least two.
 * @param label     (bar) => short axis label for that bar.
 * @param title     (bar) => tooltip text for that bar.
 * @param ariaLabel one sentence describing the whole chart.
 * @param baseline  optional price to draw as a dashed reference line — the
 *                  previous close on an intraday chart, so a bar's colour
 *                  and its position against yesterday can be read together.
 */
export default function CandleSvg({ bars, label, title, ariaLabel, baseline, className = "" }) {
  if (!Array.isArray(bars) || bars.length < 2) return null;

  let lo = Math.min(...bars.map((b) => b.l));
  let hi = Math.max(...bars.map((b) => b.h));
  if (Number.isFinite(baseline)) {
    lo = Math.min(lo, baseline);
    hi = Math.max(hi, baseline);
  }
  if (lo === hi) {
    lo -= 1;
    hi += 1;
  }
  // A little air so the extreme candles are not welded to the frame.
  const pad = (hi - lo) * 0.08;
  lo -= pad;
  hi += pad;

  const plotW = CANDLE_W - PAD.left - PAD.right;
  const plotH = CANDLE_H - PAD.top - PAD.bottom;
  const step = plotW / bars.length;
  const bodyW = Math.max(1.5, Math.min(13, step * 0.62));

  const x = (i) => PAD.left + step * (i + 0.5);
  const y = (v) => PAD.top + plotH - ((v - lo) / (hi - lo)) * plotH;

  // Every bar when there are few, else about four labels spread evenly.
  const tickEvery = bars.length <= 6 ? 1 : Math.ceil(bars.length / 4);

  return (
    <svg
      className={`chart price-chart ${className}`.trim()}
      viewBox={`0 0 ${CANDLE_W} ${CANDLE_H}`}
      role="img"
      aria-label={ariaLabel}
    >
      {ticks(lo, hi).map((value) => (
        <g key={value}>
          <line className="gmp-grid" x1={PAD.left} x2={CANDLE_W - PAD.right} y1={y(value)} y2={y(value)} />
          <text className="gmp-axis" x={PAD.left - 8} y={y(value) + 4} textAnchor="end">
            {`₹${value}`}
          </text>
        </g>
      ))}

      {Number.isFinite(baseline) && (
        <g className="candle-baseline">
          <line x1={PAD.left} x2={CANDLE_W - PAD.right} y1={y(baseline)} y2={y(baseline)} />
          <text className="gmp-axis candle-baseline-label" x={CANDLE_W - PAD.right} y={y(baseline) - 4} textAnchor="end">
            prev close {inr(baseline)}
          </text>
        </g>
      )}

      {bars.map((bar, i) => {
        const up = bar.c >= bar.o;
        const top = y(Math.max(bar.o, bar.c));
        const bottom = y(Math.min(bar.o, bar.c));
        return (
          <g
            key={bar.key}
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
                 vanish entirely and read as a missing bar. */
              height={Math.max(1.5, bottom - top)}
              rx={1}
            />
            <title>{title(bar)}</title>
          </g>
        );
      })}

      {bars.map((bar, i) =>
        i % tickEvery === 0 || i === bars.length - 1 ? (
          <text key={`t-${bar.key}`} className="gmp-axis" x={x(i)} y={CANDLE_H - 10} textAnchor="middle">
            {label(bar)}
          </text>
        ) : null
      )}
    </svg>
  );
}
