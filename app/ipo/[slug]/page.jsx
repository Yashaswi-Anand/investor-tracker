import Link from "next/link";
import { notFound } from "next/navigation";
import { SITE } from "../../../lib/config";
import { getGmpHistory, getIpoBySlug } from "../../../lib/data";
import {
  dailySeries,
  fmtDate,
  fmtDateTime,
  fmtDelta,
  fmtShortDate,
  inr,
  istToday,
  priceBand,
  safeJsonLd,
  times,
} from "../../../lib/format";
import GmpLineChart from "../../components/GmpLineChart";
import {
  BoardBadge,
  GmpValue,
  KV,
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
      <p className="subtitle" style={{ margin: 0 }}>
        No GMP recorded yet. History builds up from the first snapshot.
      </p>
    );
  }

  const recent = days.slice(-30);
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
      {ipo.gmp_updated_at && (
        <p className="subtitle" style={{ margin: "0 0 8px" }}>
          Latest GMP {inr(ipo.gmp)} · updated {fmtDateTime(ipo.gmp_updated_at)} IST
        </p>
      )}

      {/* Day-wise line graph (one point per day = that day's last GMP); the
          table beside it lists the same days newest-first. */}
      <div className="hist-layout">
      {recent.length >= 2 ? (
        <GmpLineChart points={recent} mode="daily" ariaLabel={`${ipo.name} GMP trend`} />
      ) : (
        <p className="subtitle" style={{ margin: 0 }}>
          The graph appears from the second day of GMP data.
        </p>
      )}

      <div className="hist-wrap">
        <table className="hist">
          <thead>
            <tr>
              <th>Date</th>
              <th>GMP</th>
              <th>Change</th>
              <th>Est. Listing</th>
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
                  <td>
                    {delta ? (
                      <span className={row.delta > 0 ? "gmp-up" : "gmp-down"}>{delta}</span>
                    ) : (
                      <span className="gmp-flat">—</span>
                    )}
                  </td>
                  <td>{high != null ? inr(high + row.gmp) : "—"}</td>
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
          style={{ width: `${pct}%` }}
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
    return <p className="subtitle" style={{ margin: 0 }}>Dates not announced yet.</p>;
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
  const [ipo, gmpHistory] = await Promise.all([
    getIpoBySlug(slug),
    getGmpHistory(slug),
  ]);
  if (!ipo) notFound();

  const manual = ipo.manual || {};

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
        <h1 style={{ marginBottom: 4 }}>{ipo.name} IPO</h1>
        <p className="subtitle" style={{ margin: 0 }}>
          {fmtDate(ipo.open_date, true)} – {fmtDate(ipo.close_date, true)}
        </p>

        <div className="hero-stats-detail">
          <div className="stat-gmp">
            <Stat label="GMP">
              <GmpValue ipo={ipo} showPercent />
            </Stat>
          </div>
          <Stat label="Price Band">{priceBand(ipo)}</Stat>
          <Stat label="Lot Size">{ipo.lot_size ?? "—"}</Stat>
          <Stat label="Min Investment">{inr(ipo.min_investment)}</Stat>
          <Stat label="Est. Listing">{inr(ipo.estimated_listing)}</Stat>
        </div>
      </section>

      <div className="grid">
        <section className="card">
          <h2>Issue Details</h2>
          <dl>
            <KV label="Price Band">{priceBand(ipo)}</KV>
            <KV label="Lot Size">
              {ipo.lot_size ? `${ipo.lot_size} shares` : "—"}
            </KV>
            <KV label="Min Investment">{inr(ipo.min_investment)}</KV>
            <KV label="Face Value">{inr(ipo.face_value)}</KV>
            <KV label="Issue Size">
              <span style={{ fontWeight: 500, fontSize: "0.8rem" }}>
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

        <section className="card">
          <h2>Timetable</h2>
          <Timeline ipo={ipo} />
        </section>

        <section className="card">
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
            <p className="subtitle" style={{ margin: 0 }}>
              Subscription figures appear once bidding opens.
            </p>
          ) : (
            <>
              <SubscriptionBar label="QIB" value={ipo.subscription_qib} />
              <SubscriptionBar label="NII / HNI" value={ipo.subscription_nii} />
              <SubscriptionBar label="Retail" value={ipo.subscription_retail} />
              <SubscriptionBar label="Employee" value={ipo.subscription_emp} />
              <SubscriptionBar label="Total" value={ipo.subscription_total} />
            </>
          )}
        </section>

        <section className="card card-wide">
          <h2>GMP History</h2>
          <GmpHistory history={gmpHistory} ipo={ipo} />
        </section>

        {manual.about && (
          <section className="card">
            <h2>About the Company</h2>
            <p style={{ fontSize: "0.87rem", margin: 0 }}>{manual.about}</p>
          </section>
        )}

        {Array.isArray(manual.strengths) && manual.strengths.length > 0 && (
          <section className="card">
            <h2>Strengths</h2>
            <ul className="list">
              {manual.strengths.map((item, i) => (
                <li key={i}>{item}</li>
              ))}
            </ul>
          </section>
        )}

        {Array.isArray(manual.risks) && manual.risks.length > 0 && (
          <section className="card">
            <h2>Risks</h2>
            <ul className="list">
              {manual.risks.map((item, i) => (
                <li key={i}>{item}</li>
              ))}
            </ul>
          </section>
        )}

        {manual.financials && typeof manual.financials === "object" && (
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
