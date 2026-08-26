import Link from "next/link";
import { SITE } from "../../lib/config";

// Play Store requires every app to link a privacy policy URL — this page is
// what you paste into Play Console. Keep it TRUTHFUL: if you ever add
// analytics, ads, accounts or a contact form, update this page AND the Play
// Console Data safety form together, in the same change.
//
// Everything below was checked against the code on 27 Aug 2026: no analytics
// SDK, no ad SDK, no cookies, no account system, and the only browser storage
// is the light/dark preference. The one third party a visitor's browser
// actually contacts is Google Fonts.

export const metadata = {
  title: "Privacy Policy",
  description: `Privacy policy for ${SITE.name} — what data the website and Android app do and do not collect.`,
  alternates: { canonical: "/privacy" },
  robots: { index: true, follow: true },
};

const EFFECTIVE_DATE = "27 August 2026";

export default function PrivacyPage() {
  const host = SITE.url.replace("https://", "");
  return (
    <div className="container page-pad">
      <article className="card page-card">
        <h1>Privacy Policy</h1>
        <p className="subtitle">
          {SITE.name} ({host}) · Effective {EFFECTIVE_DATE}
        </p>

        <h2>The short version</h2>
        <p>
          We do not ask who you are and we have no way of finding out. There is
          no account, no sign-in, no contact form, no analytics and no
          advertising on this site or in the Android app. Nothing you do here
          is recorded against you.
        </p>

        <h2>What we do not collect</h2>
        <p>
          No name, email address, phone number, PAN, demat or bank details, and
          no financial information of any kind. We never ask for them, and
          there is nowhere on the site to enter them. The search box on the
          dashboard filters the list inside your own browser — what you type is
          never sent anywhere.
        </p>

        <h2>What is stored in your browser</h2>
        <p>
          One thing: your choice of light or dark theme, saved in your
          browser&apos;s local storage under the key <code>theme</code>. It
          never leaves your device and is not a cookie. Clearing your browser
          data removes it. The app also caches pages through a service worker
          so it opens quickly and still works with a poor connection; that
          cache holds public IPO pages, nothing about you.
        </p>
        <p>
          We set <strong>no</strong> advertising, tracking or analytics
          cookies. There are none to reject, which is why you are not asked.
        </p>

        <h2>Third parties your browser contacts</h2>
        <p>
          <strong>Google Fonts.</strong> The site loads its typeface from
          Google&apos;s font servers, so your browser makes a request to Google
          when a page loads. That request carries your IP address and browser
          details to Google, governed by Google&apos;s own privacy policy. This
          is the only third party your browser talks to directly.
        </p>
        <p>
          The IPO data itself is fetched by our server, not by your browser, so
          our data sources never see you or your device.
        </p>

        <h2>Server logs</h2>
        <p>
          The site is hosted on Hostinger and its database is Supabase. Like
          almost every host, they keep standard technical logs — IP address,
          browser type, which page was requested, when — for security and abuse
          prevention. Those logs are held by those providers under their own
          policies. We do not read them to identify or profile visitors, and we
          do not combine them with anything else.
        </p>

        <h2>The data we publish is not about you</h2>
        <p>
          Everything on this site is public market information about companies:
          issue dates, price bands, lot sizes, subscription figures, allotment
          and listing dates, registrar names, listing prices and grey market
          premium. It is collected from the National Stock Exchange of India
          and from publicly available grey-market sources, and stored in our
          own database. None of it describes a visitor.
        </p>

        <h2>The Android app</h2>
        <p>
          The Android app is a wrapper around this website (a Trusted Web
          Activity). It requests no device permissions — no contacts, no
          location, no storage, no notifications — and collects nothing beyond
          what is described above.
        </p>

        <h2>Children</h2>
        <p>
          This is a financial market information service and is not directed at
          children under 13. Since we collect no personal data from anyone, we
          collect none from children either.
        </p>

        <h2>Your rights</h2>
        <p>
          Rights to access, correct or delete personal data only apply to
          personal data that exists. We hold none, so there is nothing to
          request, export or erase. If that ever changes, this page will say so
          before it does.
        </p>

        <h2>Changes to this policy</h2>
        <p>
          If we ever begin collecting anything — analytics, accounts, alerts
          that need an email address — this page will be updated with a new
          effective date <em>before</em> that change goes live, not after.
        </p>

        <h2>Contact</h2>
        <p>
          Questions about this policy can be sent to the contact address listed
          on our Google Play listing.
        </p>

        <p className="back-row">
          <Link href="/">← Back to all IPOs</Link> ·{" "}
          <Link href="/terms">Terms of Use</Link>
        </p>
      </article>
    </div>
  );
}
