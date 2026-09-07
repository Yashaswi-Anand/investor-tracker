import Link from "next/link";

import { fmtDate, inr } from "../../lib/format";

/**
 * Today's position, in sentences.
 *
 * WHY PROSE ON A DASHBOARD. Every figure on this page lives in a table
 * cell. That is the right shape for someone scanning it and the wrong shape
 * for everything else that reads a web page: a search engine looking for a
 * snippet, and an assistant looking for a statement it can quote and
 * attribute. Asked "how many IPOs are open today", neither could find a
 * sentence here saying so — the answer was on the page, spread across a
 * dozen cells, in a form only a human could assemble.
 *
 * Written from the same data the table renders, so it cannot drift from it,
 * and stated plainly enough to be lifted verbatim. The GMP line carries its
 * own caveat because a number quoted out of this page will be quoted
 * without the disclaimer at the foot of it.
 */
export default function MarketSummary({ open, upcoming, listed, stamp }) {
  if (!open.length && !upcoming.length) return null;

  // The strongest premium among issues someone can actually still apply to.
  const topOpen = open
    .filter((ipo) => ipo.gmp != null && ipo.price_band_high)
    .sort((a, b) => b.gmp / b.price_band_high - a.gmp / a.price_band_high)[0];
  const pct = topOpen
    ? Math.round((topOpen.gmp / topOpen.price_band_high) * 100)
    : null;

  const closingFirst = [...open]
    .filter((ipo) => ipo.close_date)
    .sort((a, b) => String(a.close_date).localeCompare(String(b.close_date)))[0];

  const names = (rows) =>
    rows.map((ipo) => ipo.short_name || ipo.name).join(", ");

  return (
    <section className="market-summary" aria-label="Today's IPO market at a glance">
      <p>
        {open.length > 0 ? (
          <>
            <strong>
              {open.length} IPO{open.length === 1 ? " is" : "s are"} open for
              bidding in India right now
            </strong>{" "}
            — {names(open)}
            {closingFirst && (
              <>
                , the first closing {fmtDate(closingFirst.close_date, true)}
              </>
            )}
            .{" "}
          </>
        ) : (
          <>
            <strong>No IPO is open for bidding today.</strong>{" "}
          </>
        )}
        {upcoming.length > 0 && (
          <>
            {upcoming.length} more{" "}
            {upcoming.length === 1 ? "issue has" : "issues have"} been announced
            {upcoming[0]?.open_date && (
              <>, the next opening {fmtDate(upcoming[0].open_date, true)}</>
            )}
            .{" "}
          </>
        )}
        {listed.length > 0 && (
          <>
            {listed.length} recent listing
            {listed.length === 1 ? "" : "s"} {listed.length === 1 ? "is" : "are"}{" "}
            tracked here with their listing price and daily candles.
          </>
        )}
      </p>

      {topOpen && (
        <p>
          The highest grey market premium among open issues is{" "}
          <Link href={`/ipo/${topOpen.slug}`}>
            {topOpen.short_name || topOpen.name}
          </Link>{" "}
          at <strong>{inr(topOpen.gmp)}</strong>
          {pct != null && <> ({pct}% of its ₹{topOpen.price_band_high} cap price)</>}.
          {" "}
          <span className="market-summary-caveat">
            GMP is an unofficial grey-market figure, published by no exchange
            or regulator, and a strong premium has repeatedly preceded a weak
            listing — it is reported here, not endorsed.
          </span>
        </p>
      )}

      {stamp && (
        <p className="market-summary-stamp">
          Figures above are from the last scraper run at {stamp} IST and are
          re-read from the database on every page load.
        </p>
      )}
    </section>
  );
}
