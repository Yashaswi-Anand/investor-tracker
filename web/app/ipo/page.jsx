import Link from "next/link";

import { organizationLd, SITE, webSiteLd } from "../../lib/config";
import { getAllIpos } from "../../lib/data";
import { fmtDate, fmtIssueSize, inr, priceBand, safeJsonLd } from "../../lib/format";

/**
 * Every issue we hold, in one crawlable list.
 *
 * WHY THIS EXISTS. The homepage renders the current month by default, so
 * only about fifteen of twenty-five IPO pages had a link into them from
 * anywhere on the site; the rest sat in the sitemap alone. Sitemap-only
 * pages get discovered, but discovery and endorsement are different things
 * — internal links are how a site tells Google which of its own pages
 * matter, and ten of these were being told nothing.
 *
 * It is also a landing page in its own right. "IPO list 2026", "IPO
 * calendar", "all upcoming IPO" are real queries with no URL here to
 * answer them: the homepage is a dashboard of what is happening now, which
 * is a different question from what has happened this year.
 *
 * Rendered on the server as plain anchors, with no filter and no
 * pagination, precisely because the point is that a crawler arriving with
 * no JavaScript still leaves holding every link.
 */

export const dynamic = "force-dynamic";

export const metadata = {
  title: "All IPOs — Open, Upcoming and Recently Listed in India",
  description:
    "Every Mainboard and SME IPO we track, in one list: open now, upcoming, awaiting allotment and recently listed — with price band, lot size, GMP and dates for each.",
  alternates: { canonical: "/ipo" },
  robots: { index: true, follow: true },
};

/** The order a reader cares about, which is not the order a database returns. */
const GROUPS = [
  {
    key: "open",
    heading: "Open now",
    blurb: "Bidding is live. These close on the date shown.",
  },
  {
    key: "upcoming",
    heading: "Upcoming IPOs",
    blurb: "Announced with dates, not yet open for bidding.",
  },
  {
    key: "closed",
    heading: "Closed, awaiting allotment",
    blurb: "Bidding has ended and the basis of allotment is being finalised.",
  },
  {
    key: "allotment",
    heading: "Allotment done",
    blurb: "Shares allotted; listing still to come.",
  },
  {
    key: "listed",
    heading: "Recently listed",
    blurb: "Trading on the exchange, with the listing gain recorded.",
  },
];

function Row({ ipo }) {
  const band = priceBand(ipo);
  return (
    <li className="ipo-index-row">
      <Link href={`/ipo/${ipo.slug}`} className="ipo-index-link">
        <span className="ipo-index-name">{ipo.name}</span>
        <span className="ipo-index-meta">
          {ipo.board}
          {band !== "—" && ` · ${band}`}
          {ipo.lot_size ? ` · lot ${ipo.lot_size}` : ""}
          {ipo.gmp != null && ` · GMP ${inr(ipo.gmp)}`}
        </span>
      </Link>
      <span className="ipo-index-dates">
        {ipo.status === "listed"
          ? `Listed ${fmtDate(ipo.listing_date)}`
          : ipo.status === "upcoming"
            ? `Opens ${fmtDate(ipo.open_date)}`
            : `${fmtDate(ipo.open_date)} – ${fmtDate(ipo.close_date)}`}
        {" · "}
        {fmtIssueSize(ipo)}
      </span>
    </li>
  );
}

export default async function IpoIndexPage() {
  const ipos = await getAllIpos();

  const groups = GROUPS.map((group) => ({
    ...group,
    // Newest first inside each group: within "recently listed" the useful
    // order is by listing date, and within the rest by when they open.
    rows: ipos
      .filter((ipo) => ipo.status === group.key)
      .sort((a, b) =>
        String(b.listing_date || b.open_date || "").localeCompare(
          String(a.listing_date || a.open_date || "")
        )
      ),
  })).filter((group) => group.rows.length);

  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      organizationLd(),
      webSiteLd(),
      {
        "@type": "CollectionPage",
        "@id": `${SITE.url}/ipo#webpage`,
        url: `${SITE.url}/ipo`,
        name: metadata.title,
        description: metadata.description,
        isPartOf: { "@id": `${SITE.url}/#website` },
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "IPOs", item: SITE.url },
          {
            "@type": "ListItem",
            position: 2,
            name: "All IPOs",
            item: `${SITE.url}/ipo`,
          },
        ],
      },
    ],
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: safeJsonLd(jsonLd) }}
      />

      <div className="container page-pad">
        <article className="card page-card">
          <h1>All IPOs we track</h1>
          <p className="subtitle">
            {ipos.length} Mainboard and SME issues, grouped by where each one
            has reached. Every entry links to its own page with GMP history,
            subscription by category, the timetable and the offer documents.
          </p>

          {groups.map((group) => (
            <section key={group.key} className="ipo-index-group">
              <h2>
                {group.heading}{" "}
                <span className="ipo-index-count">{group.rows.length}</span>
              </h2>
              <p className="subtitle subtitle-flush">{group.blurb}</p>
              <ul className="ipo-index-list">
                {group.rows.map((ipo) => (
                  <Row key={ipo.slug} ipo={ipo} />
                ))}
              </ul>
            </section>
          ))}

          <p className="back-row">
            <Link href="/">← Live dashboard</Link> ·{" "}
            <Link href="/about">How this is sourced</Link>
          </p>
        </article>
      </div>
    </>
  );
}
