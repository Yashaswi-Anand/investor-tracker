/**
 * Tiny inline SVG sparkline for the dashboard — last few days of GMP at a
 * glance. Green when the latest value is at/above the first, red when below.
 * Pure markup: safe to render inside client components.
 */
export default function Sparkline({ values, width = 84, height = 26 }) {
  const v = (values || []).map(Number).filter((n) => Number.isFinite(n));
  if (v.length < 2) return <span className="gmp-flat">—</span>;

  let lo = Math.min(...v);
  let hi = Math.max(...v);
  if (lo === hi) {
    lo -= 1;
    hi += 1;
  }
  const pad = 3;
  const x = (i) => pad + (i / (v.length - 1)) * (width - pad * 2);
  const y = (n) => pad + (1 - (n - lo) / (hi - lo)) * (height - pad * 2);
  const d = v.map((n, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(n).toFixed(1)}`).join(" ");
  const down = v[v.length - 1] < v[0];

  return (
    <svg
      className="spark"
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      role="img"
      aria-label={`GMP trend ${down ? "down" : "up"}: ${v[0]} to ${v[v.length - 1]}`}
      data-down={down}
    >
      <path className="spark-line" d={d} />
      <circle className="spark-dot" cx={x(v.length - 1)} cy={y(v[v.length - 1])} r="2.6" />
    </svg>
  );
}
