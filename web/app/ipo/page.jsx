import Link from "next/link";

import { organizationLd, SITE, webSiteLd } from "../../lib/config";
import { getIposPage } from "../../lib/data";
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
 * Paged on the server, twenty to a page, and fetched page by page from the
 * database. The page numbers are plain anchors (?page=N), so a crawler
 * arriving with no JavaScript can still walk every page and every link.
 */

const PER_PAGE = 20;

/** A positive whole page number from the query string, or 1. */
function pageFrom(raw) {
  const n = parseInt(Array.isArray(raw) ? raw[0] : raw, 10);
  return Number.isFinite(n) && n > 0 ? n : 1;
}

export const dynamic = "force-dynamic";

const BASE = {
  title: "All IPOs — Open, Upcoming and Recently Listed in India",
  description:
    "Every Mainboard and SME IPO we track, in one list: open now, upcoming, awaiting allotment and recently listed — with price band, lot size, GMP and dates for each.",
};

/** Each page is its own URL, so each is its own canonical. */
export async function generateMetadata({ searchParams }) {
  const page = pageFrom((await searchParams)?.page);
  return {
    title: page > 1 ? `${BASE.title} — Page ${page}` : BASE.title,
    description: BASE.description,
    alternates: { canonical: page > 1 ? `/ipo?page=${page}` : "/ipo" },
    robots: { index: true, follow: true },
  };
}

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

/** Page links as real anchors: first, last, and a window around the current. */
function pageLinks(current, total) {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const wanted = [...new Set([1, total, current - 1, current, current + 1])]
    .filter((p) => p >= 1 && p <= total)
    .sort((a, b) => a - b);
  const out = [];
  let previous = 0;
  for (const p of wanted) {
    if (p - previous > 1) out.push("gap");
    out.push(p);
    previous = p;
  }
  return out;
}

const hrefFor = (p) => (p > 1 ? `/ipo?page=${p}` : "/ipo");

function IpoPager({ page, pageCount, from, to, total }) {
  if (pageCount <= 1) return null;
  return (
    <nav className="ipo-pager" aria-label="IPO list pages">
      {page > 1 ? (
        <Link href={hrefFor(page - 1)} className="ipo-pager-btn" rel="prev" aria-label="Previous page">
          ‹
        </Link>
      ) : (
        <span className="ipo-pager-btn" aria-disabled="true">‹</span>
      )}
      <ol className="ipo-pager-pages">
        {pageLinks(page, pageCount).map((p, i) =>
          p === "gap" ? (
            <li key={`gap-${i}`} className="ipo-pager-gap" aria-hidden="true">…</li>
          ) : (
            <li key={p}>
              <Link
                href={hrefFor(p)}
                className="ipo-pager-btn"
                data-active={p === page || undefined}
                aria-current={p === page ? "page" : undefined}
                aria-label={`Page ${p}`}
              >
                {p}
              </Link>
            </li>
          )
        )}
      </ol>
      {page < pageCount ? (
        <Link href={hrefFor(page + 1)} className="ipo-pager-btn" rel="next" aria-label="Next page">
          ›
        </Link>
      ) : (
        <span className="ipo-pager-btn" aria-disabled="true">›</span>
      )}
      <p className="ipo-pager-range">
        {from}–{to} of {total}
      </p>
    </nav>
  );
}

export default async function IpoIndexPage({ searchParams }) {
  const page = pageFrom((await searchParams)?.page);
  const { rows: ipos, total } = await getIposPage(page, PER_PAGE);
  const pageCount = Math.max(1, Math.ceil(total / PER_PAGE));
  const from = total ? (page - 1) * PER_PAGE + 1 : 0;
  const to = Math.min(page * PER_PAGE, total);

  const groups = GROUPS.map((group) => ({
    ...group,
    // This page's rows only, grouped by stage; newest first inside each.
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
        url: `${SITE.url}${hrefFor(page)}`,
        name: BASE.title,
        description: BASE.description,
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
            {total} Mainboard and SME issues, newest first
            {pageCount > 1 ? ` · page ${page} of ${pageCount}` : ""}.
          </p>

          {groups.map((group) => (
            <section key={group.key} className="ipo-index-group">
              <h2>{group.heading}</h2>
              <p className="subtitle subtitle-flush">{group.blurb}</p>
              <ul className="ipo-index-list">
                {group.rows.map((ipo) => (
                  <Row key={ipo.slug} ipo={ipo} />
                ))}
              </ul>
            </section>
          ))}

          {ipos.length === 0 ? (
            <p className="subtitle">
              Nothing on this page. <Link href="/ipo">Go to page 1</Link>
            </p>
          ) : null}

          <IpoPager page={page} pageCount={pageCount} from={from} to={to} total={total} />

          <p className="back-row">
            <Link href="/">← Live dashboard</Link> ·{" "}
            <Link href="/about">How this is sourced</Link>
          </p>
        </article>
      </div>
    </>
  );
}
