import { inr } from "../../lib/format";
import Reveal from "./Reveal";

/**
 * What a listed issue actually did: the issue price, the listing price, and
 * the move between them.
 *
 * The issue price is derived from the two figures we store rather than taken
 * from the price band. listing_gain_pct was computed against the real issue
 * price — the previous close on the listing day, which for a new listing IS
 * the issue price — and the band's upper end is not always that number. Using
 * the band would let the bars and the percentage disagree, which is the exact
 * failure the estimated listing price already had once: two plausible numbers
 * that do not add up, with nothing to say which is wrong.
 *
 * Bars are scaled from zero. On a chart of two prices a truncated axis makes
 * a 5% move look like a doubling, and this is a page people read before
 * spending money.
 */
export default function ListingResultChart({ ipo }) {
  const listed = ipo.listing_price == null ? null : Number(ipo.listing_price);
  const pct = ipo.listing_gain_pct == null ? null : Number(ipo.listing_gain_pct);
  if (listed == null || !Number.isFinite(listed)) return null;

  const issue =
    pct != null && Number.isFinite(pct) && pct !== -100
      ? listed / (1 + pct / 100)
      : null;
  if (issue == null || !Number.isFinite(issue) || issue <= 0) return null;

  const peak = Math.max(issue, listed);
  const up = pct > 0;
  const flat = pct === 0;

  const bars = [
    { key: "issue", label: "Issue price", value: issue, tone: "base" },
    { key: "listed", label: "Listed at", value: listed, tone: flat ? "base" : up ? "up" : "down" },
  ];

  return (
    <Reveal className="listing-result" count>
      <div className="listing-bars">
        {bars.map((bar) => (
          <div className="listing-col" key={bar.key}>
            <span className="listing-value num">{inr(Math.round(bar.value))}</span>
            <div className="listing-track">
              <div
                className="listing-bar"
                data-tone={bar.tone}
                style={{ "--h": `${Math.max(3, (bar.value / peak) * 100)}%` }}
              />
            </div>
            {/* A label, not a quantity — nothing here to count up. */}
            <span className="listing-label" data-nocount>
              {bar.label}
            </span>
          </div>
        ))}
      </div>

      <div className="listing-move" data-tone={flat ? "base" : up ? "up" : "down"}>
        <span className="listing-move-pct num">
          {up ? "+" : ""}
          {pct.toFixed(2)}%
        </span>
        <span className="listing-move-note" data-nocount>
          {flat
            ? "listed at the issue price"
            : up
              ? "above the issue price on debut"
              : "below the issue price on debut"}
        </span>
      </div>
    </Reveal>
  );
}
