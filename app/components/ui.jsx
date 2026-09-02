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
      {inr(Math.round(est))}{" "}
      {pct != null && (
        <span className={`est-pct ${tone}`}>
          ({pct > 0 ? "+" : ""}
          {pct.toFixed(1)}%)
        </span>
      )}
    </span>
  );
}

/**
 * What the IPO actually listed at, and the gain on the issue price.
 *
 * Deliberately renders nothing but a dash until a real price is stored. The
 * two figures it replaces are dangerous: a missing listing price computed
 * against the price band gives -100%, and an SME issue whose band NSE never
 * published gives Infinity. Both would look like confident numbers.
 *
 * The percentage is measured against the FINAL issue price taken from the
 * exchange's own listing-day row, not against our stored price band, which
 * is only the cap — a book-built issue may price below it.
 */
export function ListingResult({ ipo, showPercent = true }) {
  if (ipo.listing_price == null) return <span className="gmp-flat">—</span>;
  const pct = ipo.listing_gain_pct;
  const tone = pct == null ? "gmp-flat" : pct > 0 ? "gmp-up" : pct < 0 ? "gmp-down" : "gmp-flat";
  return (
    <span>
      {inr(ipo.listing_price)}
      {showPercent && pct != null && (
        <span className={`est-pct ${tone}`}>
          ({pct > 0 ? "+" : ""}
          {pct.toFixed(1)}%)
        </span>
      )}
    </span>
  );
}

/**
 * The premium and the listing price it implies, in one cell.
 *
 * These were two columns, and both printed the same number: the GMP as a share
 * of the price band IS the implied gain on the estimated listing price, so
 * every row said "(+83.0%)" twice. One cell states the premium, what it
 * implies, and the percentage once.
 *
 * Once an issue has actually listed the estimate disappears rather than
 * sitting beside the fact — what it did list at is the only figure that still
 * means anything, and an estimate next to it invites reading both as live.
 */
export function GmpEstimate({ ipo }) {
  if (ipo.listing_price != null) return <ListingResult ipo={ipo} />;
  if (ipo.gmp == null) return <span className="gmp-flat">—</span>;

  const value = Number(ipo.gmp);
  const pct = gmpPercent(ipo);
  // enrich() normally derives this; the same arithmetic as a fallback so the
  // component works on any row it is handed.
  const est =
    ipo.estimated_listing != null
      ? Number(ipo.estimated_listing)
      : ipo.price_band_high
        ? Number(ipo.price_band_high) + value
        : null;
  const cls = value > 0 ? "gmp-up" : value < 0 ? "gmp-down" : "gmp-flat";
  const arrow = value > 0 ? "▲" : value < 0 ? "▼" : "";
  const delta = fmtDelta(ipo.gmp_delta);

  return (
    // The two figures are wrapped in their own spans so that, in the narrow
    // column of a phone card, a line can only break BETWEEN them. Left to
    // itself the browser broke after the arrow and gave "▲" a line of its own.
    <span className="gmp-est">
      <span className={`gmp-est-part ${cls}`}>
        {arrow} {inr(Math.abs(value))}
      </span>
      {est != null && (
        <span className="gmp-est-part">
          {/* Decorative: the sentence is carried by the two figures and the
              column heading, so a screen reader gains nothing from "arrow". */}
          <span className="gmp-est-sep" aria-hidden="true">→</span>
          <span className="num">{inr(Math.round(est))}</span>
        </span>
      )}{" "}
      {pct != null && (
        <span className={`est-pct ${cls}`}>
          ({pct > 0 ? "+" : ""}
          {pct.toFixed(1)}%)
        </span>
      )}{" "}
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

export function StatusBadge({ status }) {
  const key = (status || "upcoming").toLowerCase();
  return (
    <span className={`badge badge-${key}`}>{STATUS_LABEL[key] || key}</span>
  );
}

export function BoardBadge({ board }) {
  return <span className="badge badge-board">{board || "Mainboard"}</span>;
}

export function Stat({ label, children, note }) {
  return (
    <div>
      <div className="stat-label">{label}</div>
      <div className="stat-value">{children}</div>
      {note ? <div className="stat-note">{note}</div> : null}
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
