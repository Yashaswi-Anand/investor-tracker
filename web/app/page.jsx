import { organizationLd, SITE, webSiteLd } from "../lib/config";
import {
  getAllIpos,
  getRecentGmpSnapshots,
  gmpDeltas,
  gmpSparklines,
} from "../lib/data";
import { safeJsonLd } from "../lib/format";
import IpoList from "./components/IpoList";
import Reveal from "./components/Reveal";
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

  // The newest row's timestamp is the page's own freshness, and the whole
  // proposition of a "today" query is that the answer is from today. Read
  // only by dateModified now that the visible line is gone — the claim still
  // has to be made somewhere, and a machine is the reader that cannot infer
  // it from the tiles.
  const lastUpdated = ipos.reduce(
    (newest, ipo) =>
      ipo.updated_at && (!newest || ipo.updated_at > newest) ? ipo.updated_at : newest,
    null
  );

  const open = ipos.filter((i) => i.status === "open");
  const upcoming = ipos.filter((i) => i.status === "upcoming");

  // Structured data helps Google show rich results for the listing page.
  // Only the IPOs actually emitted are counted — declaring a larger
  // numberOfItems than the list contains is a structured-data error.
  const listed = ipos.slice(0, 25);
  // One graph rather than three loose nodes, so the list, the site and the
  // publisher are linked rather than merely co-located. The list alone said
  // what is on the page; it never said who is publishing it.
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      organizationLd(),
      webSiteLd(),
      {
        "@type": "CollectionPage",
        "@id": `${SITE.url}/#webpage`,
        url: SITE.url,
        name: "Live IPO Tracker — GMP, Subscription and Allotment",
        isPartOf: { "@id": `${SITE.url}/#website` },
        about: { "@id": `${SITE.url}/#organization` },
        // The reason anyone loads this page is that it is current. Saying so
        // in the markup is the same claim the page makes in its own words.
        dateModified: new Date(lastUpdated || Date.now()).toISOString(),
        primaryImageOfPage: {
          "@type": "ImageObject",
          url: `${SITE.url}/icons/icon-512.png`,
        },
      },
      {
        "@type": "ItemList",
        name: "Live IPOs in India",
        numberOfItems: listed.length,
        itemListElement: listed.map((ipo, index) => ({
          "@type": "ListItem",
          position: index + 1,
          name: `${ipo.name} IPO`,
          url: `${SITE.url}/ipo/${ipo.slug}`,
        })),
      },
    ],
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
            {/* The second line carries the words people actually search.
                "Live Data. Smarter Decision" is a slogan: it described the
                product's manner and named none of its subject, so the H1 —
                the strongest on-page signal there is — reinforced nothing
                the title tag was competing for. */}
            <span className="hero-sub">
              Live GMP, subscription &amp; allotment for every Indian IPO
            </span>
          </h1>

          {/* The freshness line that used to sit here said its two counts
              twice: the tiles directly below already read "Open now 2" and
              "Upcoming 7", larger and first. `lastUpdated` still carries the
              claim as dateModified in the JSON-LD above, which is the half a
              search engine reads; the visible sentence was repeating tiles a
              reader had not scrolled past yet. */}
          <Reveal className="hero-stats" count>
            <div className="stat-tile">
              <div className="k">Open now</div>
              <div className="v num">{open.length}</div>
              <div className="s" data-nocount>
                {open.length
                  ? open.slice(0, 2).map((i) => i.short_name || i.name).join(" · ")
                  : "No issue open today"}
              </div>
            </div>
            <div className="stat-tile">
              <div className="k">Upcoming</div>
              <div className="v num">{upcoming.length}</div>
              <div className="s" data-nocount>
                {upcoming.length
                  ? `Next: ${upcoming[0].short_name || upcoming[0].name}`
                  : "Nothing announced yet"}
              </div>
            </div>
            <TopGmp ipos={ipos} />
          </Reveal>
        </div>
      </section>

      <div className="container sheet">
        <IpoList ipos={ipos} />
      </div>
    </>
  );
}
