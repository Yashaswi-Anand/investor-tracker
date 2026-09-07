import Link from "next/link";

import { NEWS, SITE } from "../../lib/config";

/**
 * Editorial standards.
 *
 * WHY THIS PAGE EXISTS. Google grades a finance site under YMYL, where its
 * raters are told to establish who is accountable for the information and
 * how it is produced. This site had none of that: the data was good and the
 * publisher was anonymous. /about tells the story in prose; this is the
 * policy, in the register a rater and a reader both expect — what is
 * checked, what is not, who pays for it, and what happens when something is
 * wrong.
 *
 * It also gives the Organization schema somewhere to point. schema.org has
 * publishingPrinciples, correctionsPolicy and ownershipFundingInfo, all of
 * which take a URL, and all of which were empty because there was no
 * document to name.
 *
 * Everything below is a commitment that can be checked against the site.
 * Nothing here claims an editorial board, a review process or a team, none
 * of which exist — a policy that overstates is worse than none, because the
 * first reader who tests it stops believing the figures too.
 */

export const revalidate = 600;

export const metadata = {
  title: "Editorial Standards — How This IPO Data Is Sourced and Corrected",
  description:
    "How Investor collects IPO data, what is checked and what is not, who publishes it, how it is funded, and how to get an error corrected. The accountability policy behind every figure on this site.",
  alternates: { canonical: "/editorial" },
  robots: { index: true, follow: true },
};

export default function EditorialPage() {
  return (
    <div className="container page-pad">
      <article className="card page-card">
        <h1>Editorial standards</h1>
        <p className="subtitle">
          What this site checks, what it does not, and who answers for it.
        </p>

        <h2>Who publishes this</h2>
        <p>
          {SITE.name} is published by <strong>{SITE.owner}</strong>. It is
          maintained by one person, not a newsroom, and this page does not
          pretend otherwise — there is no editorial board, no panel of
          analysts and no review committee. What there is instead is a narrow
          scope, named sources, and a correction route that works.
        </p>
        {SITE.contactEmail && (
          <p>
            Everything here is answerable at{" "}
            <a href={`mailto:${SITE.contactEmail}`}>{SITE.contactEmail}</a>, and
            that address is read.
          </p>
        )}

        <h2>How the figures are produced</h2>
        <p>
          Almost nothing on this site is written by hand. A scraper runs every
          two hours, reads the sources named below, and writes what it finds to
          a database; pages are rendered on each request, so what you see is
          the last thing collected rather than a snapshot baked into a build.
          Every IPO page carries the timestamp of that run, in IST, so the
          freshness is checkable rather than asserted.
        </p>
        <dl className="detail-grid">
          <div>
            <dt>Issue mechanics</dt>
            <dd>
              The National Stock Exchange — dates, price band, lot size, issue
              size, registrar and the offer documents. Where anything on this
              site disagrees with NSE, NSE is right.
            </dd>
          </div>
          <div>
            <dt>Subscription</dt>
            <dd>
              NSE&apos;s category-wise figures, captured on every run. Where
              the exchange publishes a stale or empty table, the page says so
              and names the time it was written rather than presenting it as
              current.
            </dd>
          </div>
          <div>
            <dt>Share price after listing</dt>
            <dd>
              NSE&apos;s last traded price during market hours, and their
              end-of-day bhavcopy for the daily candles.
            </dd>
          </div>
          <div>
            <dt>Grey market premium</dt>
            <dd>
              Third-party grey-market sources. See the limits below — this is
              the one number on the site that cannot be verified against a
              primary source.
            </dd>
          </div>
          <div>
            <dt>Headlines</dt>
            <dd>
              {NEWS.publisher}&apos;s public feed. Each links to their story; we
              do not reproduce the article or claim it.
            </dd>
          </div>
        </dl>

        <h2>What is checked, and what is not</h2>
        <ul className="policy-list">
          <li>
            <strong>Checked.</strong> Figures are parsed from the source rather
            than retyped, so a transcription error is not possible. Where two
            sources disagree, the more authoritative and more recent one wins
            and the page records which was used and when.
          </li>
          <li>
            <strong>Not checked.</strong> Nothing here is verified against the
            prospectus by a human before publication. A source that publishes a
            wrong figure will be republished wrong until it is corrected or
            reported.
          </li>
          <li>
            <strong>Never generated.</strong> No figure on this site is
            estimated, interpolated or filled in when a source is silent. An
            absent value is shown as absent, because a plausible number is
            worse than a gap on a page people act on.
          </li>
        </ul>

        <h2>The grey market premium, specifically</h2>
        <p>
          GMP is <strong>unofficial and unregulated</strong>. No exchange, no
          regulator and no issuer publishes one. Every figure here is collected
          from third-party sites reporting what dealers are said to be quoting:
          it cannot be audited, it moves through the day, it is frequently
          wrong, and a strong premium has repeatedly preceded a weak listing.
        </p>
        <p>
          It is published because readers ask for it, not because it predicts
          anything. {SITE.owner} does not trade in the grey market, deal in
          &ldquo;subject to&rdquo; applications or Kostak rates, and has no
          relationship with anyone who does.
        </p>

        <h2>What this site does not do</h2>
        <ul className="policy-list">
          <li>
            <strong>No recommendations.</strong> No apply/avoid verdict, no
            rating, no target price, anywhere. {SITE.owner} is not a
            SEBI-registered investment adviser, research analyst or broker, and
            nothing here is investment advice.
          </li>
          <li>
            <strong>No paid placement.</strong> No issuer, registrar, broker or
            intermediary has paid for coverage, position or emphasis on this
            site, and none has been offered the opportunity. Ordering is by
            date and status, never by arrangement.
          </li>
          <li>
            <strong>No allotment lookup through us.</strong> Only the registrar
            knows. Where one answers a browser directly — KFin does — the{" "}
            <Link href="/allotment">allotment page</Link> asks it from yours
            and the PAN never touches this site; where the answer sits behind
            a CAPTCHA, the page routes you to the registrar rather than working
            around it.
          </li>
        </ul>

        <h2 id="funding">How this is funded</h2>
        <p>
          By advertising, or by nothing. There is no subscription, no paywall,
          no affiliate link to a broker, and no commission on any application
          made after reading this site. If display advertising is running, it
          is disclosed in the{" "}
          <Link href="/privacy">privacy policy</Link>, and advertisers have no
          influence over what appears here or in what order.
        </p>

        <h2 id="corrections">Corrections</h2>
        <p>
          Data collected automatically goes wrong — a band published late, a
          premium a source got wrong, a date that moved. If a figure here does
          not match the exchange or the prospectus,{" "}
          <Link href="/contact">tell us</Link> and it will be fixed.
        </p>
        <p>
          Most errors are fixed at the source of the parsing and reach the site
          on the next scraper run, within two hours. Where an error was visible
          long enough to have been acted on, the correction is noted on the
          page rather than made silently. Until a correction lands, the
          prospectus and the exchange are right and this site is not.
        </p>

        <p className="back-row">
          <Link href="/about">← About this site</Link> ·{" "}
          <Link href="/contact">Contact</Link> ·{" "}
          <Link href="/privacy">Privacy Policy</Link> ·{" "}
          <Link href="/terms">Terms of Use</Link>
        </p>
      </article>
    </div>
  );
}
