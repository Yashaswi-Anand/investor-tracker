import Link from "next/link";

import { organizationLd, SITE, webSiteLd } from "../../lib/config";
import { getAllIpos } from "../../lib/data";
import { fmtDate, safeJsonLd } from "../../lib/format";
import { registrarFor } from "../../lib/registrars";
import { AllotmentProvider, IssueRows, PanBox } from "../components/Allotment";

// Which issues are at allotment moves during the day, like everything else
// here, so this is not a build-time snapshot.
export const dynamic = "force-dynamic";

export const metadata = {
  title: "IPO Allotment Status by PAN — Check Every Issue at Allotment",
  description:
    "Check IPO allotment status by PAN number for every issue whose allotment is out. KFin issues are checked directly from your browser; for the rest, the right registrar with your PAN ready. Nothing is sent to us.",
  alternates: { canonical: "/allotment" },
  robots: { index: true, follow: true },
};

/**
 * Issues at allotment, and only those.
 *
 * Listed ones used to be here too, on the reasoning that a registrar keeps
 * the lookup open after listing. In practice it doubled the list with issues
 * whose answer is already in the reader's demat account, and the one thing
 * this page has to be is short enough to work through. An issue drops off it
 * the day it lists — by then the shares are either there or they are not.
 */
const AT_ALLOTMENT = new Set(["allotment"]);
/** Still bidding or just closed: the ones whose allotment is next. */
const COMING = new Set(["open", "closed"]);

function issueOf(ipo) {
  const registrar = registrarFor(ipo);
  const lookup = (ipo.details || {}).lookup;
  // Direct only when the registrar can take a browser's question AND the
  // scraper has found this issue's id on the registrar's own page. Either
  // missing, the issue gets the hand-off — never a button that cannot work.
  const direct = Boolean(
    registrar?.direct &&
      lookup?.registrar === registrar.key &&
      lookup?.client_id &&
      lookup?.endpoint
  );
  return {
    slug: ipo.slug,
    name: ipo.name,
    short_name: ipo.short_name,
    board: ipo.board,
    allotment_date: ipo.allotment_date,
    listing_date: ipo.listing_date,
    registrar,
    direct,
    lookup: direct
      ? { client_id: lookup.client_id, endpoint: lookup.endpoint, name: lookup.name }
      : null,
  };
}

export default async function AllotmentPage() {
  const all = await getAllIpos();
  const issues = all
    .filter((ipo) => AT_ALLOTMENT.has(ipo.status))
    .sort((a, b) => String(a.listing_date || "").localeCompare(String(b.listing_date || "")))
    .map(issueOf);

  const coming = all
    .filter((ipo) => COMING.has(ipo.status))
    .sort((a, b) =>
      String(a.allotment_date || a.close_date || "").localeCompare(
        String(b.allotment_date || b.close_date || "")
      )
    )
    .slice(0, 6);

  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      organizationLd(),
      webSiteLd(),
      {
        "@type": "WebPage",
        "@id": `${SITE.url}/allotment#webpage`,
        url: `${SITE.url}/allotment`,
        name: metadata.title,
        description: metadata.description,
        isPartOf: { "@id": `${SITE.url}/#website` },
        publisher: { "@id": `${SITE.url}/#organization` },
        inLanguage: "en-IN",
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "IPOs", item: SITE.url },
          {
            "@type": "ListItem",
            position: 2,
            name: "Allotment status",
            item: `${SITE.url}/allotment`,
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
        <section className="allot-head">
          <h1 className="news-h1">Check IPO allotment status by PAN</h1>
          <p className="subtitle news-lede">
            Add your PAN once. For issues handled by KFin Technologies the
            answer comes straight from KFin&apos;s own server to your browser;
            for the rest, the page opens the right registrar with the PAN a
            tap from their form and keeps your note of what it said.
          </p>

          {/* A callout, not a sentence in a paragraph: the first version of
              this page said the same thing in the lede and it did not land.
              Not a heading either — the last version made it the page's only
              H2, and a heading that says what the page cannot do is the
              wrong thing for a crawler to find first. */}
          <aside className="allot-notice">
            <p>
              <strong>Your PAN never reaches this site.</strong> It lives in
              your browser. A KFin check goes from your browser directly to
              KFin — the same request their page makes when you use it — and
              the answer comes back the same way; we are not on the path.
            </p>
            <p>
              Every other registrar — Bigshare, MUFG Intime, Skyline — puts
              the answer behind a CAPTCHA, which exists to stop a site asking
              on your behalf, and this one does not try to get past it. There
              the last step stays yours: open their page, paste the PAN,
              answer the CAPTCHA, and set the row to what it said.
            </p>
          </aside>
        </section>

        <AllotmentProvider>
          <PanBox />

          {issues.length === 0 ? (
            <section className="card card-wide">
              <h2>No issue is at allotment right now</h2>
              <p className="subtitle subtitle-flush">
                An issue appears here from the day its basis of allotment is
                finalised until the day it lists.
                {coming.length
                  ? " These are next:"
                  : " Nothing is open or awaiting allotment at the moment."}
              </p>
              {coming.length ? <Coming ipos={coming} /> : null}
            </section>
          ) : (
            issues.map((issue) => (
              <section
                key={issue.slug}
                className="card card-wide allot-issue"
                id={issue.slug}
              >
                <div className="result-head">
                  <div>
                    <h2 className="allot-issue-title">
                      {issue.short_name || issue.name} IPO allotment status
                    </h2>
                    <p className="allot-issue-meta">
                      {issue.board ? `${issue.board} · ` : ""}
                      Registrar{" "}
                      <strong>{issue.registrar?.name || "not published"}</strong>
                      {issue.allotment_date
                        ? ` · Allotment ${fmtDate(issue.allotment_date, true)}`
                        : ""}
                      {issue.listing_date
                        ? ` · Lists ${fmtDate(issue.listing_date, true)}`
                        : ""}
                    </p>
                  </div>
                  {issue.registrar?.portal ? (
                    <a
                      className="result-open"
                      href={issue.registrar.portal}
                      target="_blank"
                      rel="noopener noreferrer nofollow"
                    >
                      Open {issue.registrar.short}
                      <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
                        <path
                          d="M6 3h7v7M13 3 4 12"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.8"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </a>
                  ) : null}
                </div>

                {issue.direct ? (
                  <p className="allot-direct">
                    Checked with KFin directly from your browser, the way their
                    own page does it — nothing passes through this site. KFin
                    lists this issue as <strong>{issue.lookup.name}</strong>.
                  </p>
                ) : issue.registrar ? (
                  <ol className="result-steps">
                    {issue.registrar.steps.map((step) => (
                      <li key={step}>{step}</li>
                    ))}
                    <li>Come back and set the row below to what it said</li>
                  </ol>
                ) : (
                  <p className="allot-direct">
                    NSE has not published a registrar for this issue yet. The
                    prospectus names one; it will appear here when the next
                    scrape finds it.
                  </p>
                )}

                <IssueRows
                  slug={issue.slug}
                  name={issue.name}
                  direct={issue.direct}
                  lookup={issue.lookup}
                  portal={issue.registrar?.portal || null}
                  registrarShort={issue.registrar?.short || "the registrar"}
                />

                <p className="allot-issue-foot">
                  <Link href={`/ipo/${issue.slug}`}>
                    {issue.short_name || issue.name} IPO page
                  </Link>{" "}
                  — GMP, subscription by category, timetable and documents.
                </p>
              </section>
            ))
          )}
        </AllotmentProvider>

        {issues.length > 0 && coming.length > 0 ? (
          <section className="card card-wide">
            <h2>Next allotments</h2>
            <p className="subtitle subtitle-flush">
              Issues still bidding or just closed. Each joins the list above
              on its allotment date.
            </p>
            <Coming ipos={coming} />
          </section>
        ) : null}

        <p className="disclaimer news-disclaimer">
          The registrar is the only authority on allotment. A KFin answer here
          is KFin&apos;s, relayed by your browser; anything you record for
          another registrar is your own note of what you saw on their site.
          Either way it lives in this browser — {SITE.name} never receives it.
        </p>
      </div>
    </>
  );
}

/** The issues whose allotment comes next, as links, with the date and registrar. */
function Coming({ ipos }) {
  return (
    <ul className="allot-next">
      {ipos.map((ipo) => {
        const registrar = registrarFor(ipo);
        return (
          <li key={ipo.slug}>
            <Link href={`/ipo/${ipo.slug}`}>{ipo.short_name || ipo.name}</Link>
            <span className="allot-next-meta">
              {ipo.allotment_date
                ? `allotment ${fmtDate(ipo.allotment_date, true)}`
                : ipo.close_date
                  ? `closes ${fmtDate(ipo.close_date, true)}`
                  : ""}
              {registrar ? ` · ${registrar.short}` : ""}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
