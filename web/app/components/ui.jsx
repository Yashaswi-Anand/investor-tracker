/** Shared presentational pieces. Server components — no client JS shipped. */

import { STATUS_LABEL, fmtDelta, gmpPercent, inr } from "../../lib/format";

/**
 * GMP with colour/arrow, optional % of upper band, and — when the row
 * carries `gmp_delta` — a small day-over-day change chip (+₹12 / −₹4).
 */
export function GmpValue({ ipo, showPercent = false }) {
  if (ipo.gmp == null) return <span className="gmp-flat">—</span>;
  const value = Number(ipo.gmp);
  const pct = gmpPercent(ipo);
  const cls = value > 0 ? "gmp-up" : value < 0 ? "gmp-down" : "gmp-flat";
  const arrow = value > 0 ? "▲" : value < 0 ? "▼" : "";
  const delta = fmtDelta(ipo.gmp_delta);

  return (
    <span className={cls}>
      {arrow} {inr(Math.abs(value))}
      {showPercent && pct != null && (
        <span className="gmp-pct"> ({pct > 0 ? "+" : ""}{pct.toFixed(1)}%)</span>
      )}
      {delta && (
        <span
          className={`gmp-delta ${ipo.gmp_delta > 0 ? "gmp-delta-up" : "gmp-delta-down"}`}
          title="Change since yesterday"
        >
          {delta}
        </span>
      )}
    </span>
  );
}

/**
 * Estimated listing price (upper band + GMP) with the gain it implies.
 *
 * The percentage carries the up/down colour while the rupee figure stays in
 * body text — colouring the whole cell made the table read as a wall of green.
 * `.est-pct` deliberately sets no colour of its own so it cannot fight the
 * `.gmp-up` / `.gmp-down` class sitting alongside it.
 */
export function EstListing({ ipo }) {
  // Normally enrich() in lib/data.js has already derived this, but fall back
  // to the same arithmetic so the component works on any row it is handed
  // rather than silently rendering a dash.
  const est =
    ipo.estimated_listing != null
      ? Number(ipo.estimated_listing)
      : ipo.gmp != null && ipo.price_band_high
        ? Number(ipo.price_band_high) + Number(ipo.gmp)
        : null;
  if (est == null) return <span className="gmp-flat">—</span>;
  const pct = gmpPercent(ipo);
  const tone = pct == null ? "gmp-flat" : pct > 0 ? "gmp-up" : pct < 0 ? "gmp-down" : "gmp-flat";
  return (
    <span>
      {inr(Math.round(est))}
      {pct != null && (
        <span className={`est-pct ${tone}`}>
          ({pct > 0 ? "+" : ""}
          {pct.toFixed(1)}%)
        </span>
      )}
    </span>
  );
}

export function StatusBadge({ status }) {
  const key = (status || "upcoming").toLowerCase();
  return (
    <span className={`badge badge-${key}`}>{STATUS_LABEL[key] || key}</span>
  );
}

export function BoardBadge({ board }) {
  return <span className="badge badge-board">{board || "Mainboard"}</span>;
}

export function Stat({ label, children }) {
  return (
    <div>
      <div className="stat-label">{label}</div>
      <div className="stat-value">{children}</div>
    </div>
  );
}

export function KV({ label, children }) {
  return (
    <div className="kv">
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}
