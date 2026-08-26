import Link from "next/link";
import { SITE } from "../lib/config";
import {
  getAllIpos,
  getRecentGmpSnapshots,
  gmpDeltas,
  gmpSparklines,
} from "../lib/data";
import { gmpPercent, inr, safeJsonLd } from "../lib/format";
import IpoList from "./components/IpoList";

// Rendered on every request: a live tracker must never show a cached GMP.
// (See the note in lib/data.js for why ISR was removed.)
export const dynamic = "force-dynamic";

export const metadata = {
  title: "Live IPO Tracker — GMP, Subscription, Price Band, Allotment & Listing Dates",
  description:
    "Track every Mainboard and SME IPO in India in one place: live GMP with daily history, subscription status (QIB/NII/Retail), price band, lot size, minimum investment, allotment and listing dates.",
  alternates: { canonical: "/" },
};

export default async function HomePage() {
  const [rawIpos, snapshots] = await Promise.all([
    getAllIpos(),
    getRecentGmpSnapshots(),
  ]);
  // Day-over-day GMP movement + a 3-day sparkline per IPO for the dashboard.
  const deltas = gmpDeltas(snapshots);
  const sparks = gmpSparklines(snapshots);
  const ipos = rawIpos.map((ipo) => ({
    ...ipo,
    gmp_delta: deltas[ipo.slug] ? deltas[ipo.slug].delta : null,
    gmp_spark: sparks[ipo.slug] || null,
  }));

  const open = ipos.filter((i) => i.status === "open");
  const upcoming = ipos.filter((i) => i.status === "upcoming");

  // Ranked as a PERCENTAGE of the price band, not as rupees: a ₹60 premium
  // on a ₹120 issue is a far better bet than ₹60 on a ₹900 one, and ranking
  // by the rupee figure would put the expensive issue on top every time.
  const topGmp = (status) => {
    const candidates = ipos.filter(
      (i) => i.status === status && gmpPercent(i) != null
    );
    if (!candidates.length) return null;
    return candidates.reduce((best, i) =>
      gmpPercent(i) > gmpPercent(best) ? i : best
    );
  };

  // Split by stage, because they answer different questions: one is what you
  // can still apply for today, the other what to watch for.
  const topOpen = topGmp("open");
  const topUpcoming = topGmp("upcoming");

  // Structured data helps Google show rich results for the listing page.
  // Only the IPOs actually emitted are counted — declaring a larger
  // numberOfItems than the list contains is a structured-data error.
  const listed = ipos.slice(0, 25);
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: "Live IPOs in India",
    numberOfItems: listed.length,
    itemListElement: listed.map((ipo, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: `${ipo.name} IPO`,
      url: `${SITE.url}/ipo/${ipo.slug}`,
    })),
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: safeJsonLd(jsonLd) }}
      />

      <section className="hero">
        <div className="container">
          {/* Two lines, one heading: the second is a supporting clause, not a
              separate thought, so splitting it into its own element would tell
              a screen reader otherwise. The long-form keywords live in the
              page metadata. */}
          <h1>
            IPO Insights.
            <span className="hero-sub">Live Data. Smarter Decision</span>
          </h1>

          <div className="hero-stats">
            <div className="stat-tile">
              <div className="k">Open now</div>
              <div className="v num">{open.length}</div>
              <div className="s">
                {open.length
                  ? open.slice(0, 2).map((i) => i.short_name || i.name).join(" · ")
                  : "No issue open today"}
              </div>
            </div>
            <div className="stat-tile">
              <div className="k">Upcoming</div>
              <div className="v num">{upcoming.length}</div>
              <div className="s">
                {upcoming.length
                  ? `Next: ${upcoming[0].short_name || upcoming[0].name}`
                  : "Nothing announced yet"}
              </div>
            </div>
            <div className="stat-tile stat-tile-wide">
              <div className="k">Top GMP (% of price)</div>
              <div className="top-gmp">
                {[
                  ["Open", topOpen],
                  ["Upcoming", topUpcoming],
                ].map(([label, ipo]) =>
                  ipo ? (
                    <Link
                      key={label}
                      href={`/ipo/${ipo.slug}`}
                      className="top-gmp-row"
                      title={`${ipo.name} — GMP ${inr(ipo.gmp)} on ${inr(ipo.price_band_high)}`}
                    >
                      <span className="top-gmp-label">{label}</span>
                      <span className="top-gmp-name">
                        {ipo.short_name || ipo.name}
                      </span>
                      <span className="top-gmp-pct num">
                        {gmpPercent(ipo) > 0 ? "+" : ""}
                        {gmpPercent(ipo).toFixed(0)}%
                      </span>
                    </Link>
                  ) : (
                    <div key={label} className="top-gmp-row" data-empty="true">
                      <span className="top-gmp-label">{label}</span>
                      <span className="top-gmp-name">No premium yet</span>
                    </div>
                  )
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="container sheet">
        <IpoList ipos={ipos} />
      </div>
    </>
  );
}
