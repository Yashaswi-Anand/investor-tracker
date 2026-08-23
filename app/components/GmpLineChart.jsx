import { fmtDateTime, fmtShortDate, inr } from "../../lib/format";

/**
 * GMP line chart — server-rendered inline SVG, no chart library.
 *
 * Plots every recorded snapshot (30-minute granularity) over time, so intraday
 * moves are visible, with an area fill, a dot per point (when not too dense),
 * the latest value labelled, ₹ gridlines and IST date ticks. Colours come
 * from CSS tokens so it follows light/dark mode.
 */

const W = 640;
const H = 210;
const PAD = { top: 18, right: 18, bottom: 30, left: 52 };

function downsample(points, max = 240) {
  if (points.length <= max) return points;
  const step = Math.ceil(points.length / max);
  return points.filter((_, i) => i % step === 0 || i === points.length - 1);
}

function niceTicks(lo, hi) {
  // Three ticks: low, middle, high — rounded for readability.
  const mid = (lo + hi) / 2;
  const round = (v) => (Math.abs(hi - lo) >= 20 ? Math.round(v) : Math.round(v * 10) / 10);
  return [round(lo), round(mid), round(hi)];
}

export default function GmpLineChart({ points, ariaLabel = "GMP trend" }) {
  const data = downsample(
    (points || [])
      .filter((p) => p && p.gmp != null && p.recorded_at)
      .map((p) => ({ v: Number(p.gmp), t: new Date(p.recorded_at).getTime(), at: p.recorded_at }))
      .filter((p) => Number.isFinite(p.v) && Number.isFinite(p.t))
      .sort((a, b) => a.t - b.t)
  );

  if (data.length < 2) return null;

  const values = data.map((d) => d.v);
  let lo = Math.min(...values);
  let hi = Math.max(...values);
  if (lo === hi) {
    lo -= 1;
    hi += 1;
  }
  const ticks = niceTicks(lo, hi);
  const padV = (hi - lo) * 0.1;
  const yMin = lo - padV;
  const yMax = hi + padV;

  const t0 = data[0].t;
  const t1 = data[data.length - 1].t;
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const x = (t) => PAD.left + ((t - t0) / Math.max(1, t1 - t0)) * innerW;
  const y = (v) => PAD.top + (1 - (v - yMin) / (yMax - yMin)) * innerH;

  const linePath = data
    .map((d, i) => `${i ? "L" : "M"}${x(d.t).toFixed(1)},${y(d.v).toFixed(1)}`)
    .join(" ");
  const baseY = (H - PAD.bottom).toFixed(1);
  const areaPath = `${linePath} L${x(t1).toFixed(1)},${baseY} L${x(t0).toFixed(1)},${baseY} Z`;

  const first = data[0];
  const last = data[data.length - 1];
  const down = last.v < first.v;

  // Up to 4 date ticks, evenly spread by index (dedupe identical labels).
  const tickIdx = [0, Math.floor((data.length - 1) / 3), Math.floor((2 * (data.length - 1)) / 3), data.length - 1];
  const seen = new Set();
  const xTicks = tickIdx
    .map((i) => ({ x: x(data[i].t), label: fmtShortDate(data[i].at) }))
    .filter((t) => (seen.has(t.label) ? false : (seen.add(t.label), true)));

  const showDots = data.length <= 64;
  const lastX = x(last.t);
  const lastY = y(last.v);
  // Keep the last-value label inside the chart.
  const labelAnchor = lastX > W - PAD.right - 60 ? "end" : "start";
  const labelDx = labelAnchor === "end" ? -10 : 10;

  return (
    <div className="chart-wrap">
      <svg
        className="chart"
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={`${ariaLabel}: from ${inr(first.v)} on ${fmtShortDate(first.at)} to ${inr(last.v)} on ${fmtShortDate(last.at)}`}
      >
        <defs>
          <linearGradient id="gmpFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" className={down ? "gmp-stop-down-a" : "gmp-stop-a"} />
            <stop offset="100%" className={down ? "gmp-stop-down-b" : "gmp-stop-b"} />
          </linearGradient>
        </defs>

        {/* gridlines + ₹ labels */}
        {ticks.map((tv) => (
          <g key={tv}>
            <line className="gmp-grid" x1={PAD.left} x2={W - PAD.right} y1={y(tv)} y2={y(tv)} />
            <text className="gmp-axis" x={PAD.left - 8} y={y(tv) + 4} textAnchor="end">
              ₹{tv}
            </text>
          </g>
        ))}

        {/* area + line */}
        <path className="gmp-area" d={areaPath} />
        <path className="gmp-line" data-down={down} d={linePath} />

        {/* points with tooltips */}
        {showDots &&
          data.map((d, i) => (
            <circle
              key={i}
              className={i === data.length - 1 ? "gmp-dot-last" : "gmp-dot"}
              data-down={down}
              cx={x(d.t)}
              cy={y(d.v)}
              r={i === data.length - 1 ? 5 : 3}
            >
              <title>{`₹${d.v} — ${fmtDateTime(d.at)} IST`}</title>
            </circle>
          ))}
        {!showDots && (
          <circle className="gmp-dot-last" data-down={down} cx={lastX} cy={lastY} r={5}>
            <title>{`₹${last.v} — ${fmtDateTime(last.at)} IST`}</title>
          </circle>
        )}

        {/* latest value label */}
        <text
          className="gmp-last-label"
          x={lastX + labelDx}
          y={lastY - 10}
          textAnchor={labelAnchor}
        >
          {inr(last.v)}
        </text>

        {/* date ticks */}
        {xTicks.map((t, i) => (
          <text
            key={i}
            className="gmp-axis"
            x={t.x}
            y={H - 8}
            textAnchor={i === 0 ? "start" : i === xTicks.length - 1 ? "end" : "middle"}
          >
            {t.label}
          </text>
        ))}
      </svg>
    </div>
  );
}
