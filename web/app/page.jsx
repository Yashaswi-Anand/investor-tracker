import { SITE } from "../lib/config";
import {
  getAllIpos,
  getRecentGmpSnapshots,
  gmpDeltas,
  gmpSparklines,
  lastUpdatedAt,
} from "../lib/data";
import {
  fmtShortDate,
  fmtTime,
  inr,
  istDateOf,
  istToday,
  safeJsonLd,
} from "../lib/format";
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
  // Per-row freshness is formatted HERE, not in IpoList: that component is a
  // client component, and running toLocaleTimeString on both sides of the
  // boundary invites a hydration mismatch between Node's ICU and the
  // browser's. Today's premiums show a clock time; older ones show the day,
  // which is the honest signal that a premium has not moved recently.
  const today = istToday();
  const ipos = rawIpos.map((ipo) => ({
    ...ipo,
    gmp_delta: deltas[ipo.slug] ? deltas[ipo.slug].delta : null,
    gmp_spark: sparks[ipo.slug] || null,
    gmp_stamp: ipo.gmp_updated_at
      ? istDateOf(ipo.gmp_updated_at) === today
        ? fmtTime(ipo.gmp_updated_at)
        : fmtShortDate(ipo.gmp_updated_at)
      : null,
  }));

  // When the scraper last refreshed the data — shown so readers can see the
  // page is live, even on a run where no premium moved.
  const lastRun = lastUpdatedAt(ipos);

  const open = ipos.filter((i) => i.status === "open");
  const upcoming = ipos.filter((i) => i.status === "upcoming");
  const withGmp = ipos.filter((i) => i.gmp != null && i.price_band_high);
  const topGmp = withGmp.length
    ? withGmp.reduce((best, i) =>
        i.gmp / i.price_band_high > best.gmp / best.price_band_high ? i : best
      )
    : null;

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
          <h1>Track every IPO in India — in one place</h1>
          <p>
            Live GMP with daily history, subscription status, price band, lot
            size, minimum investment, allotment and listing dates for Mainboard
            &amp; SME IPOs.
          </p>

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
            <div className="stat-tile">
              <div className="k">Top GMP (% of price)</div>
              <div className="v num">
                {topGmp
                  ? `+${((topGmp.gmp / topGmp.price_band_high) * 100).toFixed(0)}%`
                  : "—"}
              </div>
              <div className="s">
                {topGmp
                  ? `${topGmp.short_name || topGmp.name} · GMP ${inr(topGmp.gmp)} on ${inr(topGmp.price_band_high)}`
                  : "GMP not recorded yet"}
              </div>
            </div>
            <div className="stat-tile">
              <div className="k">Last updated</div>
              <div className="v num">
                {lastRun ? fmtTime(lastRun) : "—"}
              </div>
              <div className="s">
                {lastRun
                  ? `${fmtShortDate(lastRun)} IST · ${ipos.length} IPOs tracked`
                  : `${ipos.length} IPOs · Mainboard + SME`}
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
