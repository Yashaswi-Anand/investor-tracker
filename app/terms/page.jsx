import Link from "next/link";
import { SITE } from "../../lib/config";

// The disclaimers here are not decoration. This site publishes grey market
// premium, which is an unregulated number, next to listing gains a reader may
// act on. If the site ever starts taking money, carrying ads, or making
// "apply / avoid" calls, have a lawyer read this page first — those change
// what it has to say.

export const metadata = {
  title: "Terms of Use",
  description: `Terms of use for ${SITE.name} — an independent IPO information service for India. Not investment advice.`,
  alternates: { canonical: "/terms" },
  robots: { index: true, follow: true },
};

const EFFECTIVE_DATE = "3 September 2026";

export default function TermsPage() {
  const host = SITE.url.replace("https://", "");
  return (
    <div className="container page-pad">
      <article className="card page-card">
        <h1>Terms of Use</h1>
        <p className="subtitle">
          {SITE.name} ({host}) · Effective {EFFECTIVE_DATE}
        </p>

        <h2>What this site is</h2>
        <p>
          {SITE.name} is an independent information service that collects
          publicly available details about Initial Public Offerings in India —
          Mainboard and SME — and presents them in one place. By using the site
          or the Android app you accept these terms. If you do not accept them,
          please do not use the service.
        </p>

        <h2>This is not investment advice</h2>
        <p>
          Nothing here is a recommendation to buy, sell, apply for or avoid any
          security. We are <strong>not</strong> a SEBI-registered investment
          adviser, research analyst, merchant banker or broker, and we have no
          relationship with any issuer, registrar, lead manager or exchange
          whose information appears on this site. We do not tell you what to
          apply for, and we publish no &quot;apply or avoid&quot; verdict.
        </p>
        <p>
          IPO investing carries risk, including the loss of capital. Decide for
          yourself, on the prospectus and your own circumstances, and consult a
          SEBI-registered adviser if you want advice.
        </p>

        <h2>Grey Market Premium — read this before you rely on it</h2>
        <p>
          The grey market is an <strong>unofficial and unregulated</strong>{" "}
          market. No exchange, regulator or issuer publishes a grey market
          premium. Every GMP figure on this site is collected from third-party
          websites that report what dealers are said to be quoting; it cannot
          be audited, it changes through the day, it is frequently wrong, and a
          strong premium has repeatedly preceded a weak listing.
        </p>
        <p>
          We publish GMP because readers ask for it, not because it predicts
          anything. We do not trade in the grey market, do not deal in
          &quot;subject to&quot; applications or Kostak rates, and have no
          connection to anyone who does. Treat GMP as market gossip with a
          number attached.
        </p>

        <h2>Accuracy, and where the data comes from</h2>
        <p>
          IPO dates, price bands, lot sizes, subscription figures and issue
          details come from the National Stock Exchange of India. Timetable
          dates and registrar details come from the issuer&apos;s published
          prospectus timetable as republished by third parties. Listing prices
          come from NSE&apos;s daily bhavcopy archive. GMP comes from
          third-party grey-market trackers.
        </p>
        <p>
          The data is collected automatically and refreshed periodically, so it
          can be delayed, incomplete or wrong — a source can change its format,
          go down, or publish an error, and we will republish it. Scheduled
          dates such as allotment and listing are the issuer&apos;s stated
          plan, and plans move.
        </p>
        <p>
          <strong>
            Before you apply, verify on NSE, BSE, the registrar&apos;s own
            website or the prospectus.
          </strong>{" "}
          Those are authoritative. This site is not.
        </p>

        <h2>No warranty</h2>
        <p>
          The service is provided &quot;as is&quot; and &quot;as
          available&quot;, without warranty of any kind, express or implied,
          including accuracy, completeness, timeliness, fitness for a
          particular purpose or uninterrupted availability. We may change,
          suspend or discontinue any part of it at any time without notice.
        </p>

        <h2>Limitation of liability</h2>
        <p>
          To the fullest extent permitted by law, we are not liable for any
          loss or damage — including trading or investment losses, lost
          profits, or losses arising from a missed date, a wrong figure, or the
          service being unavailable — resulting from your use of, or reliance
          on, anything published here.
        </p>

        <h2>Acceptable use</h2>
        <p>
          Please use the site normally. Do not attempt to disrupt it, break
          into it, or scrape it in a way that degrades service for others. Do
          not present our pages as your own or republish the data in bulk as a
          competing dataset. Reasonable personal use, linking to us, and
          quoting a figure with attribution are all fine.
        </p>

        <h2>The allotment page</h2>
        <p>
          That page does not check your allotment. It cannot: every registrar
          puts the answer behind a CAPTCHA, which is there precisely to stop a
          site like this asking on someone&apos;s behalf, and we do not work
          around it. What the page does is hand you the right registrar for
          each issue with your PAN ready to paste, and keep a note of what you
          found.
        </p>
        <p>
          <strong>The registrar is the only authority on allotment.</strong>
          Anything shown on that page is your own record of what you saw on
          their site. It is not a confirmation, it is not evidence of an
          allotment, and it should never be relied on in place of the
          registrar&apos;s own answer or your demat statement. If the two
          disagree, the registrar is right.
        </p>
        <p>
          PAN numbers entered there stay in your browser and are never sent to
          us. Enter only PANs you are entitled to use — your own, or those you
          are authorised to act for.
        </p>

        <h2>Third-party names and links</h2>
        <p>
          Company names, trademarks and logos mentioned here belong to their
          owners and are used only to identify the IPO being described. Their
          appearance implies no endorsement or affiliation in either direction.
          Links to other sites — exchanges, registrars, prospectus documents —
          are provided for convenience; we do not control them and are not
          responsible for their content.
        </p>

        <h2>Privacy</h2>
        <p>
          We receive no personal data. The allotment page asks for a PAN, but
          it never leaves your browser — what is stored on your device, and why
          that keeps us outside the duties the DPDP Act places on whoever holds
          personal data, is set out in our{" "}
          <Link href="/privacy">Privacy Policy</Link>.
        </p>

        <h2>Advertising</h2>
        <p>
          Pages here may carry advertising served by Google. Those ads are
          chosen and delivered by Google, not selected, written or endorsed by
          us, and an advertiser appearing beside an issue implies nothing about
          that issue or about them. Anything an ad claims is between you and
          the advertiser.
        </p>
        <p>
          What advertising never does here is change the data. No figure on
          this site is placed, ordered, withheld or coloured by anyone paying
          for space, and no company can pay to appear, to rank higher, or to
          have a premium shown differently.
        </p>

        <h2>Changes to these terms</h2>
        <p>
          These terms may be updated as the service changes. The effective date
          at the top will change with them, and continuing to use the site
          after that means you accept the revised terms.
        </p>

        <h2>Governing law</h2>
        <p>
          These terms are governed by the laws of India, and the courts of
          India have jurisdiction over any dispute arising from them.
        </p>

        <h2>Contact</h2>
        <p>
          Questions about these terms can be sent to the contact address listed
          on our Google Play listing.
        </p>

        <p className="back-row">
          <Link href="/">← Back to all IPOs</Link> ·{" "}
          <Link href="/privacy">Privacy Policy</Link>
        </p>
      </article>
    </div>
  );
}
