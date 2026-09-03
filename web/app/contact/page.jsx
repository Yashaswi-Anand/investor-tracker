import Link from "next/link";
import { SITE } from "../../lib/config";

// A reachable address, which running ads is conditional on and which this
// site previously did not have — the privacy policy pointed at a Google Play
// listing that has not been published, so there was no route at all.
//
// No form. A form needs somewhere to post to, which means a server that
// receives names and messages, which means holding personal data this site
// otherwise never touches. An address costs nothing and can be replied to.

export const metadata = {
  title: "Contact",
  description: `How to reach ${SITE.name} — corrections to IPO data, questions about the site, and press or partnership enquiries.`,
  alternates: { canonical: "/contact" },
  robots: { index: true, follow: true },
};

const REASONS = [
  {
    title: "A figure looks wrong",
    body: "The most useful thing you can send. Name the issue and the field, and say what the exchange or the prospectus shows instead — corrections are made against the source, not against an opinion.",
  },
  {
    title: "Something is broken",
    body: "A page that will not load, a link that goes nowhere, a number that renders as a dash where it should not. What you were looking at and what your device is helps more than a screenshot alone.",
  },
  {
    title: "Content and copyright",
    body: "Headlines here are linked, never reproduced in full. If you publish one of them and want it delisted, write in and it will be removed.",
  },
  {
    title: "Anything else",
    body: "Press, partnerships, or a question the FAQ on an IPO page did not answer.",
  },
];

export default function ContactPage() {
  const email = SITE.contactEmail;

  return (
    <div className="container page-pad">
      <article className="card page-card">
        <h1>Contact</h1>
        <p className="subtitle">
          One person maintains this. Replies are not instant, but every message
          is read.
        </p>

        {email ? (
          <p className="contact-address">
            <a href={`mailto:${email}`}>{email}</a>
          </p>
        ) : (
          /* Better an honest gap than a placeholder address that bounces —
             a contact page whose contact does not work is worse than none. */
          <p className="contact-missing">
            No public address is configured yet. Until one is, the repository
            behind this site is the way through:{" "}
            <a
              href="https://github.com/Yashaswi-Anand/investor-tracker/issues"
              target="_blank"
              rel="noopener noreferrer"
            >
              open an issue on GitHub
            </a>
            .
          </p>
        )}

        <h2>What to write about</h2>
        <dl className="detail-grid">
          {REASONS.map((reason) => (
            <div key={reason.title}>
              <dt>{reason.title}</dt>
              <dd>{reason.body}</dd>
            </div>
          ))}
        </dl>

        <h2>What we cannot help with</h2>
        <p>
          <strong>Whether to apply for an issue.</strong> We are not a
          SEBI-registered adviser, analyst or broker, and we do not give a view
          on any IPO — not by email either. Decide from the prospectus and your
          own circumstances, and take advice from someone registered to give
          it.
        </p>
        <p>
          <strong>Your allotment.</strong> Only the registrar for that issue
          knows, and we have no way to look it up. The{" "}
          <Link href="/allotment">allotment page</Link> lists the right
          registrar for each issue.
        </p>
        <p>
          <strong>Your application, refund or demat account.</strong> Those sit
          with your bank, your broker and the registrar. We hold no account of
          yours — there is nothing to sign in to here.
        </p>

        <h2>Please do not send</h2>
        <p>
          PAN numbers, application numbers, bank or demat details, or any
          document containing them. We have no use for them, no system that
          expects them, and no wish to hold them. A message that arrives with
          one gets deleted rather than answered.
        </p>

        <p className="back-row">
          <Link href="/">← Back to all IPOs</Link> ·{" "}
          <Link href="/about">About</Link> ·{" "}
          <Link href="/privacy">Privacy Policy</Link>
        </p>
      </article>
    </div>
  );
}
