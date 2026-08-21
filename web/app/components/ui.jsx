/** Shared presentational pieces. Server components — no client JS shipped. */

import { STATUS_LABEL, gmpPercent, inr } from "../../lib/format";

export function GmpValue({ ipo, showPercent = false }) {
  if (ipo.gmp == null) return <span className="gmp-flat">—</span>;
  const value = Number(ipo.gmp);
  const pct = gmpPercent(ipo);
  const cls = value > 0 ? "gmp-up" : value < 0 ? "gmp-down" : "gmp-flat";
  const arrow = value > 0 ? "▲" : value < 0 ? "▼" : "";

  return (
    <span className={cls}>
      {arrow} {inr(Math.abs(value))}
      {showPercent && pct != null && (
        <span className="gmp-pct"> ({pct > 0 ? "+" : ""}{pct.toFixed(1)}%)</span>
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
