import Link from "next/link";
import { notFound } from "next/navigation";
import { SITE } from "../../../lib/config";
import {
  getGmpHistory,
  getIpoBySlug,
  getSubscriptionHistory,
} from "../../../lib/data";
import { getNews, matchNews } from "../../../lib/news";
import { NEWS } from "../../../lib/config";
import {
  dailyLatest,
  dailySeries,
  fmtDate,
  fmtDateTime,
  fmtDelta,
  fmtIssueSize,
  fmtShortDate,
  fmtTime,
  inr,
  istToday,
  minLotsLabel,
  priceBand,
  safeJsonLd,
  times,
} from "../../../lib/format";
import Financials from "../../components/Financials";
import PriceChart from "../../components/PriceChart";
import NewsList from "../../components/NewsList";
import Reveal from "../../components/Reveal";
import GmpLineChart from "../../components/GmpLineChart";
import {
  BoardBadge,
  GmpValue,
  KV,
  ListingResult,
  Stat,
  StatusBadge,
} from "../../components/ui";

// Rendered on every request so the GMP, subscription figures and history
// are always the latest — no build-time snapshot, no ISR cache.
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }) {
  const { slug } = await params;
  const ipo = await getIpoBySlug(slug);
  if (!ipo) return { title: "IPO Not Found" };

  const band =
    ipo.price_band_low != null && ipo.price_band_high != null
      ? `₹${ipo.price_band_low}–₹${ipo.price_band_high}`
      : "TBA";
  const title = `${ipo.name} IPO — GMP Today, Date, Price Band`;
  const description = `${ipo.name} IPO: GMP ${
    ipo.gmp != null ? `₹${ipo.gmp}` : "TBA"
  }, price band ${band}, lot size ${ipo.lot_size ?? "TBA"}. Opens ${fmtDate(
    ipo.open_date,
    true
  )}, closes ${fmtDate(
    ipo.close_date,
    true
  )}. Subscription status, allotment and listing details.`;

  return {
    title,
    description,
    alternates: { canonical: `/ipo/${ipo.slug}` },
    openGraph: {
      title,
      description,
      url: `${SITE.url}/ipo/${ipo.slug}`,
      type: "article",
      // A page-level openGraph object REPLACES the layout's rather than
      // merging with it, so siteName has to be repeated here.
      siteName: SITE.name,
    },
  };
}

/**
 * GMP history: one bar + one table row per IST day (the day's last value).
 * Readers check this every visit, so the table leads with the most recent
 * day and shows the day-over-day change and the implied listing price.
 */
function GmpHistory({ history, ipo }) {
  const days = dailySeries(history);

  if (!days.length) {
    return (
      <p className="subtitle subtitle-flush">
        No GMP recorded yet. History builds up from the first snapshot.
      </p>
    );
  }

  // Nothing after the listing day. The scraper stops recording there now,
  // but snapshots written before it learned to are still in the table, and a
  // premium plotted past the listing is a guess drawn over a fact.
  const listingDay = ipo.listing_date ? String(ipo.listing_date).slice(0, 10) : null;
  const upToListing = listingDay ? days.filter((d) => d.date < listingDay) : days;
  const recent = upToListing.slice(-30);
  const high = ipo.price_band_high != null ? Number(ipo.price_band_high) : null;

  // Newest first for the table, with change vs the previous day.
  const rows = recent
    .map((day, index) => ({
      ...day,
      delta: index > 0 ? Number((day.gmp - recent[index - 1].gmp).toFixed(2)) : null,
    }))
    .reverse();

  return (
    <>
      {/* `updated_at` is stamped on every scraper run, so this reads as
          "last refreshed" even on a run where no premium moved. */}
      <p className="subtitle hist-caption">
        {ipo.gmp != null && <>Latest GMP {inr(ipo.gmp)} · </>}
        Last updated{" "}
        <strong className="hist-stamp">
          {fmtDateTime(ipo.updated_at || ipo.gmp_updated_at)} IST
        </strong>
      </p>

      {/* Day-wise line graph (one point per day = that day's last GMP); the
          table beside it lists the same days newest-first. */}
      <div className="hist-layout">
      {recent.length >= 2 ? (
        <Reveal className="chart-reveal">
          <GmpLineChart points={recent} mode="daily" ariaLabel={`${ipo.name} GMP trend`} />
        </Reveal>
      ) : (
        <p className="subtitle subtitle-flush">
          The graph appears from the second day of GMP data.
        </p>
      )}

      <div className="hist-wrap">
        <table className="hist">
          <thead>
            <tr>
              <th>Date</th>
              <th>GMP</th>
              {/* The premium as a share of the price band: the only form of
                  it that is comparable with any other issue. */}
              <th>GMP %</th>
              <th>Change</th>
              <th>Est. Listing</th>
              {/* Each row is a day; the time is that day's last recorded
                  snapshot, so readers can see exactly how fresh it is. */}
              <th>Updated (IST)</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const delta = fmtDelta(row.delta);
              return (
                <tr key={row.date}>
                  <td>{fmtDate(row.date)}</td>
                  <td className={row.gmp > 0 ? "gmp-up" : row.gmp < 0 ? "gmp-down" : "gmp-flat"}>
                    {inr(row.gmp)}
                  </td>
                  <td className={row.gmp > 0 ? "gmp-up" : row.gmp < 0 ? "gmp-down" : "gmp-flat"}>
                    {high ? `${row.gmp > 0 ? "+" : ""}${((row.gmp / high) * 100).toFixed(1)}%` : "—"}
                  </td>
                  <td>
                    {delta ? (
                      <span className={row.delta > 0 ? "gmp-up" : "gmp-down"}>{delta}</span>
                    ) : (
                      <span className="gmp-flat">—</span>
                    )}
                  </td>
                  <td>{high != null ? inr(high + row.gmp) : "—"}</td>
                  <td className="hist-updated">
                    <time dateTime={row.recorded_at}>{fmtTime(row.recorded_at)}</time>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      </div>
    </>
  );
}

/** A full bar means 10x subscribed; green means fully subscribed (>= 1x). */
const SUBSCRIPTION_FULL_SCALE = 10;

/**
 * How demand built, one row per day.
 *
 * The scraper has been writing a subscription snapshot on every run since the
 * table existed; nothing read it until now. Only each day's LAST snapshot is
 * kept, so a row reads as where the book stood at the end of that day rather
 * than wherever it happened to be when a run fired.
 *
 * Hidden below two days: with a single row this repeats the bars above it.
 */
function SubscriptionHistory({ history }) {
  const days = dailyLatest(history, ["qib", "nii", "retail", "total"]);
  if (days.length < 2) return null;

  const recent = days.slice(-15);
  const rows = [...recent].reverse();

  return (
    <>
      <p className="subtitle sub-hist-caption">
        Day-wise subscription
      </p>
      {/* Laid out like GMP History above it: how demand built on the left,
          the figures that shape is made of on the right. The two cards
          answer the same kind of question and now look like it. */}
      <div className="hist-layout">
      <Reveal className="chart-reveal">
        <GmpLineChart
          points={recent}
          valueKey="total"
          format={times}
          ariaLabel="Total subscription trend"
        />
      </Reveal>
      <div className="hist-wrap">
        <table className="hist">
          <thead>
            <tr>
              <th>Date</th>
              <th>QIB</th>
              <th>NII / HNI</th>
              <th>Retail</th>
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((day) => (
              <tr key={day.date}>
                <td>{fmtDate(day.date)}</td>
                <td>{times(day.qib)}</td>
                <td>{times(day.nii)}</td>
                <td>{times(day.retail)}</td>
                <td>{times(day.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      </div>
    </>
  );
}

/** The issue mechanics NSE publishes, in the order a reader meets them. */
const ISSUE_DETAIL_ROWS = [
  ["issue_type", "Issue Type"],
  ["discount", "Discount"],
  ["categories", "Categories"],
  ["max_retail", "Max Bid (Retail)"],
  ["max_employee", "Max Bid (Employee)"],
  ["tick_size", "Tick Size"],
  ["market_timings", "Bidding Hours"],
  ["upi_cutoff", "UPI Mandate Cut-off"],
  ["sponsor_bank", "Sponsor Bank"],
];

const DOCUMENT_ROWS = [
  ["rhp_url", "Red Herring Prospectus"],
  ["ratios_url", "Basis of Issue Price"],
  ["anchor_url", "Anchor Allocation"],
];

/**
 * Company and issue detail collected by the scraper.
 *
 * NSE first: it carries every mechanic here — issue type, discount, UPI
 * cut-off, the prospectus link. What it does NOT carry is what the business
 * actually is, so the description, sector and promoters come from the
 * fallback source and only fill gaps NSE leaves.
 *
 * Renders nothing at all when the blob is empty, rather than an empty card.
 */
function IssueDetails({ ipo }) {
  const details = ipo.details || {};
  const issueRows = ISSUE_DETAIL_ROWS.filter(([key]) => details[key]);
  const documents = DOCUMENT_ROWS.filter(([key]) => details[key]);

  if (!details.objects && !issueRows.length && !documents.length) return null;

  return (
    <section className="card card-wide">
      <h2>Issue Details</h2>

      {details.objects && (
        <>
          <p className="subtitle sub-hist-caption">Objects of the issue</p>
          <p className="about-text">{details.objects}</p>
        </>
      )}

      {issueRows.length > 0 && (
        <>
          <p className="subtitle sub-hist-caption">Issue mechanics</p>
          <dl className="detail-grid">
            {issueRows.map(([key, label]) => (
              <KV key={key} label={label}>
                <span className="kv-note">{details[key]}</span>
              </KV>
            ))}
          </dl>
        </>
      )}

      {(details.registrar_address || details.registrar_contact) && (
        <>
          <p className="subtitle sub-hist-caption">Registrar</p>
          <dl className="detail-grid">
            {ipo.registrar && <KV label="Name">{ipo.registrar}</KV>}
            {details.registrar_address && (
              <KV label="Address">
                <span className="kv-note">{details.registrar_address}</span>
              </KV>
            )}
            {details.registrar_contact && (
              <KV label="Contact">
                <span className="kv-note">{details.registrar_contact}</span>
              </KV>
            )}
          </dl>
        </>
      )}

      {documents.length > 0 && (
        <>
          <p className="subtitle sub-hist-caption">Documents</p>
          <ul className="list">
            {documents.map(([key, label]) => (
              <li key={key}>
                {/* NSE serves these as ZIPs from its own archive. External and
                    untrusted-by-default, hence noopener. */}
                <a
                  href={details[key]}
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                >
                  {label} ↗
                </a>
              </li>
            ))}
          </ul>
        </>
      )}

      <p className="subtitle sub-hist-caption">
        Collected from NSE and public sources. Always confirm against the
        prospectus before applying.
      </p>
    </section>
  );
}

function SubscriptionBar({ label, value }) {
  if (value == null) return null;
  const amount = Number(value);
  // No minimum width: a floor would draw a sliver of progress for a category
  // that has taken no bids at all, contradicting the 0.00x printed beside it.
  const pct = Math.min(100, (amount / SUBSCRIPTION_FULL_SCALE) * 100);
  return (
    <div className="sub-row">
      <div className="sub-head">
        <span>{label}</span>
        <strong>{times(value)}</strong>
      </div>
      <div className="sub-track">
        <div
          className="sub-fill"
          data-over={amount >= 1}
          style={{ "--fill": `${pct}%` }}
        />
      </div>
    </div>
  );
}

function Timeline({ ipo }) {
  // IST, not the server's UTC date — otherwise every milestone stays
  // unmarked for the first 5.5 hours of each Indian day.
  const today = istToday();
  const steps = [
    ["Open", ipo.open_date],
    ["Close", ipo.close_date],
    ["Allotment", ipo.allotment_date],
    ["Refunds", ipo.refund_date],
    ["Demat credit", ipo.demat_date],
    ["Listing", ipo.listing_date],
  ].filter(([, date]) => date);

  if (!steps.length) {
    return <p className="subtitle subtitle-flush">Dates not announced yet.</p>;
  }

  return (
    <div className="timeline">
      {steps.map(([label, date]) => (
        <div className="tl-item" key={label} data-done={date <= today}>
          <div className="tl-label">{label}</div>
          <div className="tl-date">{fmtDate(date, true)}</div>
        </div>
      ))}
    </div>
  );
}

/**
 * Question/answer pairs built from the IPO's own data.
 *
 * Rendered visibly on the page AND emitted as FAQPage structured data — the
 * two must always match, so they are generated here once.
 */
function buildFaq(ipo) {
  const items = [
    {
      question: `What is the GMP of ${ipo.name} IPO today?`,
      answer:
        ipo.gmp != null
          ? `The latest grey market premium for ${ipo.name} IPO is ₹${ipo.gmp}. GMP is unofficial and indicative only — it is not a guarantee of listing price.`
          : `No grey market premium has been recorded for ${ipo.name} IPO yet.`,
    },
    {
      question: `What is the price band of ${ipo.name} IPO?`,
      answer: `The price band is ${priceBand(ipo)}${
        ipo.lot_size
          ? `, with a lot size of ${ipo.lot_size} shares`
          : ""
      }${
        ipo.min_investment
          ? `. The minimum investment is ${inr(ipo.min_investment)}`
          : ""
      }.`,
    },
    {
      question: `When does ${ipo.name} IPO open and close?`,
      answer: `The issue opens on ${fmtDate(
        ipo.open_date,
        true
      )} and closes on ${fmtDate(ipo.close_date, true)}${
        ipo.listing_date
          ? `. Listing is expected on ${fmtDate(ipo.listing_date, true)}`
          : ""
      }.`,
    },
  ];

  if (ipo.registrar) {
    items.push({
      question: `Who is the registrar for ${ipo.name} IPO?`,
      answer: `${ipo.registrar} is the registrar. Allotment status can be checked on the registrar's website once allotment is finalised.`,
    });
  }

  return items;
}

export default async function IpoDetailPage({ params }) {
  const { slug } = await params;
  const [ipo, gmpHistory, subscriptionHistory, allNews] = await Promise.all([
    getIpoBySlug(slug),
    getGmpHistory(slug),
    getSubscriptionHistory(slug),
    // Shares the cached feed with /news, so a detail page costs the
    // publisher nothing of its own.
    getNews(),
  ]);
  if (!ipo) notFound();

  const manual = ipo.manual || {};
  // Hand-written content always wins over anything scraped.
  const details = ipo.details || {};
  const about = manual.about || details.about;
  const strengths = Array.isArray(manual.strengths) && manual.strengths.length
    ? manual.strengths
    : details.strengths;
  // Same rule as strengths: hand-written wins, scraped fills the gap. The
  // source publishes risks for some issues and not others, so this section
  // simply does not appear when neither has any.
  const risks = Array.isArray(manual.risks) && manual.risks.length
    ? manual.risks
    : details.risks;
  // Only stories that name this company. The feed is general IPO coverage,
  // so most of it is about other issues and showing it here would be worse
  // than showing nothing.
  const news = matchNews(allNews, ipo);

  // The same Q&A drives both the visible FAQ section and the JSON-LD.
  // Google requires structured-data content to be visible on the page, so
  // markup describing answers the reader cannot see would be a violation.
  const faq = buildFaq(ipo);

  const jsonLd = [
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        {
          "@type": "ListItem",
          position: 1,
          name: "IPOs",
          item: SITE.url,
        },
        {
          "@type": "ListItem",
          position: 2,
          name: `${ipo.name} IPO`,
          item: `${SITE.url}/ipo/${ipo.slug}`,
        },
      ],
    },
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: faq.map(({ question, answer }) => ({
        "@type": "Question",
        name: question,
        acceptedAnswer: { "@type": "Answer", text: answer },
      })),
    },
  ];

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: safeJsonLd(jsonLd) }}
      />

      <div className="container">
      <Link href="/" className="back-link">
        ← All IPOs
      </Link>

      <section className="detail-head">
        <div className="detail-badges">
          <StatusBadge status={ipo.status} />
          <BoardBadge board={ipo.board} />
          {ipo.symbol && <span className="badge badge-board">{ipo.symbol}</span>}
        </div>
        <h1 className="detail-title">{ipo.name} IPO</h1>
        <p className="subtitle subtitle-flush">
          {fmtDate(ipo.open_date, true)} – {fmtDate(ipo.close_date, true)}
        </p>

        <Reveal className="hero-stats-detail" count>
          <div className="stat-gmp">
            <Stat label="GMP">
              <GmpValue ipo={ipo} showPercent />
            </Stat>
          </div>
          <Stat label="Price Band">{priceBand(ipo)}</Stat>
          {/* Next to the band because both describe the offer rather than
              what one application costs. */}
          <Stat label="Issue Size">{fmtIssueSize(ipo)}</Stat>
          <Stat label="Lot Size">{ipo.lot_size ?? "—"}</Stat>
          {/* The lot count is on the figure itself. On the SME board the
              minimum is two lots, and a number two and a half times the one
              beside it reads as an error until it says why. */}
          <Stat label="Min Investment" note={minLotsLabel(ipo)}>
            {inr(ipo.min_investment)}
          </Stat>
          {ipo.listing_price != null ? (
            <Stat label="Listed At">
              <ListingResult ipo={ipo} />
            </Stat>
          ) : (
            <Stat label="Est. Listing">{inr(ipo.estimated_listing)}</Stat>
          )}
        </Reveal>
      </section>

      <div className="grid">
        {/* Two short KV cards that read side by side on a wide screen and
            stack on a phone. Inside a cluster rather than loose in the grid:
            a cluster divides only the space it is given, so a missing card
            widens its neighbour instead of leaving a hole. */}
        <div className="grid-cluster">
        <section className="card">
          <h2>Issue Details</h2>
          <dl>
            <KV label="Price Band">{priceBand(ipo)}</KV>
            <KV label="Lot Size">
              {ipo.lot_size ? `${ipo.lot_size} shares` : "—"}
            </KV>
            <KV label="Min Investment">
              {inr(ipo.min_investment)}
              {minLotsLabel(ipo) ? (
                <span className="kv-note kv-note-inline"> ({minLotsLabel(ipo)})</span>
              ) : null}
            </KV>
            <KV label="Face Value">{inr(ipo.face_value)}</KV>
            <KV label="Issue Size">
              <span className="kv-note">
                {ipo.issue_size || "—"}
              </span>
            </KV>
            <KV label="Registrar">
              {ipo.registrar_url ? (
                <a href={ipo.registrar_url} target="_blank" rel="noopener noreferrer">
                  {ipo.registrar || "Check allotment"} ↗
                </a>
              ) : (
                ipo.registrar || "—"
              )}
            </KV>
          </dl>
        </section>

        {/* Once it trades there is a real price, quoted all day, and that is
            the only chart worth showing — so it comes before the timetable
            and before the premium history, which by then is a record of what
            the grey market guessed. */}
        {ipo.status === "listed" && (
          <section className="card card-wide">
            <h2>Price Since Listing</h2>
            {(ipo.details || {}).prices?.length >= 2 ? (
              <PriceChart ipo={ipo} />
            ) : (
              <p className="subtitle subtitle-flush">
                Daily prices appear once NSE publishes the day&apos;s closing
                data, which is in the evening.
              </p>
            )}
          </section>
        )}

        <section className="card">
          <h2>Timetable</h2>
          <Timeline ipo={ipo} />
        </section>
        </div>

        <section className="card card-wide">
          <h2>GMP History</h2>
          <GmpHistory history={gmpHistory} ipo={ipo} />
        </section>

        <section className="card card-wide">
          <h2>Subscription</h2>
          {/* Gate on ANY figure being present. Category-wise numbers often
              arrive before the total, and gating on the total alone would
              hide QIB/NII/Retail data we already have. */}
          {[
            ipo.subscription_qib,
            ipo.subscription_nii,
            ipo.subscription_retail,
            ipo.subscription_emp,
            ipo.subscription_total,
          ].every((value) => value == null) ? (
            <p className="subtitle subtitle-flush">
              Subscription figures appear once bidding opens.
            </p>
          ) : (
            <>
              <Reveal className="sub-bars" count>
              <SubscriptionBar label="QIB" value={ipo.subscription_qib} />
              <SubscriptionBar label="NII / HNI" value={ipo.subscription_nii} />
              <SubscriptionBar label="Retail" value={ipo.subscription_retail} />
              <SubscriptionBar label="Employee" value={ipo.subscription_emp} />
              <SubscriptionBar label="Total" value={ipo.subscription_total} />
              </Reveal>
            </>
          )}
          <SubscriptionHistory history={subscriptionHistory} />
        </section>

        {about && (
          <section className="card card-wide about-card">
            <h2>About {ipo.short_name || ipo.name}</h2>

            {/* The sector sits under the heading as a label rather than as a
                row in the table below, because it is the one fact that frames
                everything the paragraph then says. */}
            {details.sector && (
              <p className="about-tags">
                <span className="chip">{details.sector}</span>
                {details.incorporated && (
                  <span className="chip chip-quiet">
                    Incorporated {details.incorporated}
                  </span>
                )}
              </p>
            )}

            {/* Capped measure: the card runs the full width of the page and
                unbroken prose across 1,100px is genuinely hard to track back
                from at the end of a line. */}
            <p className="about-text about-prose">{about}</p>

            {(details.promoters ||
              details.promoter_holding_pre ||
              details.promoter_holding_post) && (
              <dl className="detail-grid about-meta">
                {details.promoters && (
                  <KV label="Promoters">{details.promoters}</KV>
                )}
                {details.promoter_holding_pre && (
                  <KV label="Promoter holding (pre-issue)">
                    {details.promoter_holding_pre}
                  </KV>
                )}
                {details.promoter_holding_post && (
                  <KV label="Promoter holding (post-issue)">
                    {details.promoter_holding_post}
                  </KV>
                )}
              </dl>
            )}

            {/* Said out loud, because a reader deserves to know whose
                description of the company they are reading. */}
            <p className="subtitle sub-hist-caption">
              As published in the company's own offer documents.
            </p>
          </section>
        )}

        {/* Three short lists, any of which may be absent: the source does not
            publish risks for every issue. Auto-fitting them together means
            whichever exist divide the row between them. */}
        <div className="grid-cluster">
        {Array.isArray(strengths) && strengths.length > 0 && (
          <section className="card">
            <h2>Strengths</h2>
            <ul className="list">
              {strengths.map((item, i) => (
                <li key={i}>{item}</li>
              ))}
            </ul>
            {!(Array.isArray(manual.strengths) && manual.strengths.length) && (
              <p className="subtitle sub-hist-caption">
                As stated by the company in its prospectus — not our assessment.
              </p>
            )}
          </section>
        )}

        {Array.isArray(risks) && risks.length > 0 && (
          <section className="card">
            <h2>Risks</h2>
            <ul className="list">
              {risks.map((item, i) => (
                <li key={i}>{item}</li>
              ))}
            </ul>
            {!(Array.isArray(manual.risks) && manual.risks.length) && (
              <p className="subtitle sub-hist-caption">
                As stated by the company in its prospectus — not our assessment.
              </p>
            )}
          </section>
        )}
        {Array.isArray(ipo.lead_managers) && ipo.lead_managers.length > 0 && (
          <section className="card">
            <h2>Lead Managers</h2>
            <ul className="list">
              {ipo.lead_managers.map((item, i) => (
                <li key={i}>{item}</li>
              ))}
            </ul>
          </section>
        )}
        </div>

        {details.financials ? (
          <section className="card card-wide">
            <h2>Financials</h2>
            <Financials financials={details.financials} />
          </section>
        ) : (
          manual.financials &&
          typeof manual.financials === "object" && (
            <section className="card">
              <h2>Financials</h2>
              <dl>
                {Object.entries(manual.financials).map(([key, value]) => (
                  <KV key={key} label={key}>
                    {String(value)}
                  </KV>
                ))}
              </dl>
            </section>
          )
        )}

        {/* Mechanics last: they matter at the moment of applying, not while
            deciding, so the business comes first and the UPI cut-off after. */}
        <IssueDetails ipo={ipo} />

      </div>

        {news.length > 0 && (
          <section className="card card-wide news-card">
            <h2>In the news</h2>
            {/* Two, not six, and no match count beside the heading. This now
                sits at the end of a long page: it is context rather than the
                reason anyone came, and the News tab has the rest. */}
            <NewsList articles={news} limit={2} />
            <p className="subtitle sub-hist-caption">
              Headlines from {NEWS.publisher}, matched to this company by
              name. Reproduced as published — not our reporting, and not
              investment advice.{" "}
              <Link href="/news">More IPO news</Link>
            </p>
          </section>
        )}

      {/* Visible counterpart of the FAQPage structured data above. */}
      <section className="card faq">
        <h2>Frequently Asked Questions</h2>
        {faq.map(({ question, answer }) => (
          <details key={question} className="faq-item">
            <summary>{question}</summary>
            <p>{answer}</p>
          </details>
        ))}
      </section>
      </div>
    </>
  );
}
