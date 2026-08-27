import { SITE } from "../lib/config";
import {
  getAllIpos,
  getRecentGmpSnapshots,
  gmpDeltas,
  gmpSparklines,
} from "../lib/data";
import { safeJsonLd } from "../lib/format";
import IpoList from "./components/IpoList";
import TopGmp from "./components/TopGmp";

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
            <TopGmp ipos={ipos} />
          </div>
        </div>
      </section>

      <div className="container sheet">
        <IpoList ipos={ipos} />
      </div>
    </>
  );
}
