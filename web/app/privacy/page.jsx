import Link from "next/link";
import { SITE } from "../../lib/config";

// Play Store requires every app to link a privacy policy URL — this page is
// what you paste into Play Console. Keep it truthful: if you ever add
// analytics, ads, or accounts, update this page AND the Play Console Data
// safety form together.

export const metadata = {
  title: "Privacy Policy",
  description: `Privacy policy for ${SITE.name} — what data the website and Android app do and do not collect.`,
  alternates: { canonical: "/privacy" },
  robots: { index: true, follow: true },
};

const EFFECTIVE_DATE = "20 August 2026";

export default function PrivacyPage() {
  return (
    <article className="card" style={{ maxWidth: 760, margin: "0 auto" }}>
      <h1>Privacy Policy</h1>
      <p className="subtitle">
        {SITE.name} ({SITE.url.replace("https://", "")}) · Effective{" "}
        {EFFECTIVE_DATE}
      </p>

      <h2>What we collect</h2>
      <p>
        <strong>Nothing personal.</strong> This website and its Android app do
        not require an account, do not ask for your name, email, phone number
        or any financial detail, and do not include third-party analytics or
        advertising SDKs.
      </p>

      <h2>Data we display</h2>
      <p>
        All IPO information shown (dates, price bands, subscription figures,
        grey market premium) is market data about companies, not about you.
        It is collected from public sources such as the National Stock
        Exchange of India and stored in our database (hosted on Supabase).
      </p>

      <h2>Server logs</h2>
      <p>
        Like nearly every website, our hosting providers (Vercel and
        Supabase) keep standard technical logs — IP address, browser type,
        pages requested — for security and abuse prevention. These are
        retained by those providers per their own policies and are not used
        by us to identify or profile visitors.
      </p>

      <h2>Cookies and local storage</h2>
      <p>
        We set no advertising or tracking cookies. The app uses the
        browser&apos;s cache and a service worker only to make pages load
        faster and work offline.
      </p>

      <h2>The Android app</h2>
      <p>
        The Android app is a wrapper around this website (a Trusted Web
        Activity). It requests no device permissions and collects no data
        beyond what the website itself does, as described above.
      </p>

      <h2>Children</h2>
      <p>
        The service provides financial market information and is not directed
        at children under 13. We do not knowingly collect data from anyone,
        including children.
      </p>

      <h2>Changes</h2>
      <p>
        If we ever start collecting data (for example, by adding analytics),
        this page will be updated before that change goes live, with a new
        effective date.
      </p>

      <h2>Contact</h2>
      <p>
        Questions about this policy: reach out via the contact details on the
        Play Store listing.
      </p>

      <p style={{ marginTop: 24 }}>
        <Link href="/">← Back to all IPOs</Link>
      </p>
    </article>
  );
}
