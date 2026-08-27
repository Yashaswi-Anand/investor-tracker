"use client";

/**
 * Year-wise financials as a bar chart, one metric at a time.
 *
 * A tab rather than three charts side by side: the three metrics differ by an
 * order of magnitude (revenue in the hundreds of crore, profit in the tens),
 * so a shared axis would flatten profit into the baseline, and separate axes
 * side by side invite comparing bar heights that are not comparable.
 *
 * Drawn as plain SVG. A chart library would be several times the weight of
 * this entire page for three bars.
 */

import { useState } from "react";

const METRICS = [
  { key: "revenue", label: "Revenue" },
  { key: "profit", label: "Profit" },
  { key: "assets", label: "Total Assets" },
  { key: "net_worth", label: "Net Worth" },
];

/** "31 Mar 2026" -> "2026"; anything unexpected is left as published. */
function shortPeriod(period) {
  const year = String(period || "").match(/(\d{4})/);
  return year ? year[1] : period;
}

const fmt = (n) =>
  n == null
    ? "—"
    : Number(n).toLocaleString("en-IN", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });

export default function Financials({ financials }) {
  const rows = financials && financials.rows;
  const available = METRICS.filter(
    (m) => Array.isArray(rows && rows[m.key]) && rows[m.key].some((v) => v != null)
  );
  const [active, setActive] = useState(available.length ? available[0].key : null);

  if (!available.length || !Array.isArray(financials.periods)) return null;

  const metric = available.find((m) => m.key === active) || available[0];
  // Published newest-first; a chart reads left to right through time.
  const periods = [...financials.periods].reverse();
  const values = [...rows[metric.key]].reverse();

  // Scaled from zero, not from the smallest bar: starting an axis part-way up
  // makes a 5% rise look like a doubling, which is the oldest trick there is.
  const peak = Math.max(...values.filter((v) => v != null).map(Math.abs), 1);

  return (
    <>
      <div className="tabs fin-tabs" role="tablist" aria-label="Financial metric">
        {available.map((m) => (
          <button
            key={m.key}
            type="button"
            role="tab"
            className="tab tab-sm"
            data-active={metric.key === m.key}
            aria-selected={metric.key === m.key}
            onClick={() => setActive(m.key)}
          >
            {m.label}
          </button>
        ))}
      </div>

      <p className="subtitle fin-unit">All values in ₹ crore</p>

      <div className="fin-chart">
        {periods.map((period, index) => {
          const value = values[index];
          const height = value == null ? 0 : Math.max(2, (Math.abs(value) / peak) * 100);
          return (
            <div className="fin-col" key={period || index}>
              <span className="fin-value num">{fmt(value)}</span>
              {/* The bar measures against this track, not the whole column:
                  as a direct sibling of the labels it was competing with them
                  for height, so every bar over ~85% flattened to the same
                  ceiling and the tallest year looked equal to the one below. */}
              <div className="fin-track">
                <div
                  className="fin-bar"
                  data-negative={value != null && value < 0}
                  style={{ "--h": `${height}%` }}
                />
              </div>
              <span className="fin-year">{shortPeriod(period)}</span>
            </div>
          );
        })}
      </div>
    </>
  );
}
