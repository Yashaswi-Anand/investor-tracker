import Link from "next/link";
import { NEWS, SITE } from "../../lib/config";

// Who runs this and where the numbers come from. Written for two readers:
// someone deciding whether to trust a GMP figure, and a reviewer deciding
// whether there is a real publisher behind the domain. Both want the same
// thing — the sources named, the limits admitted.

export const metadata = {
  title: "About",
  description: `What ${SITE.name} is, where its IPO data comes from, how often it updates, and what it deliberately does not do.`,
  alternates: { canonical: "/about" },
  robots: { index: true, follow: true },
};

export default function AboutPage() {
  const host = SITE.url.replace("https://", "");

  return (
    <div className="container page-pad">
      <article className="card page-card">
        <h1>About {SITE.name}</h1>
        <p className="subtitle">{host}</p>

        <h2>What this is</h2>
        <p>
          A live tracker for Indian IPOs — every Mainboard and SME issue in one
          list, with the figures people actually check before applying: grey
          market premium and its day-by-day history, subscription across QIB,
          NII and retail, price band, lot size, the minimum application, and
          the dates for opening, closing, allotment and listing.
        </p>
        <p>
          It exists because that information is scattered. The exchange has the
          mechanics, the registrar has the allotment, the grey market has the
          premium, and the news has the context — and an applicant deciding on
          the last day of a bidding window has neither the time nor the
          patience to visit four places for one answer.
        </p>

        <h2>Where the numbers come from</h2>
        <dl className="detail-grid">
          <div>
            <dt>Issue data</dt>
            <dd>
              The{" "}
              <a
                href="https://www.nseindia.com/market-data/all-upcoming-issues-ipo"
                target="_blank"
                rel="noopener noreferrer"
              >
                National Stock Exchange
              </a>{" "}
              — dates, price band, lot size, issue size, registrar, and the
              offer documents. This is the authoritative source and everything
              here defers to it.
            </dd>
          </div>
          <div>
            <dt>Subscription</dt>
            <dd>
              NSE&apos;s category-wise figures, taken on every run so the page
              can show how demand built day by day rather than only where it
              ended.
            </dd>
          </div>
          <div>
            <dt>Listing prices</dt>
            <dd>
              NSE&apos;s daily bhavcopy — the exchange&apos;s own end-of-day
              record, which is where the candles after listing come from.
            </dd>
          </div>
          <div>
            <dt>Grey market premium</dt>
            <dd>
              Publicly available grey-market sources. Read the caution below
              before relying on it.
            </dd>
          </div>
          <div>
            <dt>Headlines</dt>
            <dd>
              {NEWS.publisher}&apos;s public feed. Each headline links to their
              story; we do not reproduce the article.
            </dd>
          </div>
        </dl>

        <h2>How often it updates</h2>
        <p>
          A scraper runs every two hours and writes what it finds to our
          database; pages are rendered on each request, so nothing you see is a
          cached snapshot from a build. Every IPO page carries the timestamp of
          the last run, in IST, so you can judge the freshness yourself instead
          of taking our word for it.
        </p>
        <p>
          The one exception is the share price of an issue that has listed:
          that is asked of NSE live when you open the page, through our server
          rather than your browser, and refreshed every half minute while the
          market trades. The time beside it is NSE&apos;s own stamp for that
          price.
        </p>

        <h2>About that grey market premium</h2>
        <p>
          The grey market is <strong>unofficial and unregulated</strong>. No
          exchange, regulator or issuer publishes a GMP. Every figure here is
          collected from third-party sites that report what dealers are said to
          be quoting — it cannot be audited, it moves through the day, it is
          frequently wrong, and a strong premium has repeatedly preceded a weak
          listing.
        </p>
        <p>
          We publish it because readers ask for it, not because it predicts
          anything. We do not trade in the grey market, deal in
          &ldquo;subject to&rdquo; applications or Kostak rates, and have no
          connection to anyone who does.
        </p>

        <h2>What this deliberately does not do</h2>
        <ul className="policy-list">
          <li>
            <strong>No recommendations.</strong> There is no apply/avoid
            verdict, no rating and no target price anywhere on this site. We
            are not a SEBI-registered adviser, analyst or broker.
          </li>
          <li>
            <strong>No allotment lookup.</strong> Only the registrar knows, and
            every one of them puts that behind a CAPTCHA meant to stop sites
            like this asking on your behalf. The{" "}
            <Link href="/allotment">allotment page</Link> takes you to the
            right registrar instead of pretending otherwise.
          </li>
          <li>
            <strong>No accounts, no tracking.</strong> There is no sign-in and
            no analytics. What little is stored sits in your own browser, and
            the <Link href="/privacy">privacy policy</Link> lists every key.
          </li>
        </ul>

        <h2>Corrections</h2>
        <p>
          Data collected automatically goes wrong sometimes — a band NSE
          published late, a premium a source got wrong, a date that changed. If
          you find a figure that does not match the exchange or the
          prospectus, <Link href="/contact">tell us</Link> and it will be
          fixed. Until then, the prospectus and the exchange are right and this
          site is not.
        </p>

        <p className="back-row">
          <Link href="/">← Back to all IPOs</Link> ·{" "}
          <Link href="/contact">Contact</Link> ·{" "}
          <Link href="/privacy">Privacy Policy</Link>
        </p>
      </article>
    </div>
  );
}
