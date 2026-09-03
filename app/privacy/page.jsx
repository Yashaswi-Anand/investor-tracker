import Link from "next/link";
import { SITE, adsLive } from "../../lib/config";

// Play Store requires every app to link a privacy policy URL — this page is
// what you paste into Play Console. Keep it TRUTHFUL: if you ever add
// analytics, ads, accounts or a contact form, update this page AND the Play
// Console Data safety form together, in the same change.
//
// Everything below was checked against the code on 3 Sep 2026: no analytics
// SDK, no ad SDK, no cookies, no account system. The one third party a
// visitor's browser actually contacts is Google Fonts.
//
// THE ALLOTMENT PAGE ASKS FOR A PAN. That is personal data under the DPDP
// Act, and this page said in as many words that there was nowhere on the site
// to enter one — written before that page existed and left standing after it
// shipped, which made this document untrue for four days. It is corrected
// below. The reason it stays a short section rather than a long one is that
// the PAN never reaches a server: it is typed, stored and used entirely
// inside the reader's own browser, so there is no collection to disclose.
// If that ever changes, this page and the Play Console Data safety form have
// to change in the SAME commit, before the feature ships.

export const metadata = {
  title: "Privacy Policy",
  description: `Privacy policy for ${SITE.name} — what data the website and Android app do and do not collect.`,
  alternates: { canonical: "/privacy" },
  robots: { index: true, follow: true },
};

const EFFECTIVE_DATE = "3 September 2026";

// Ads are disclosed here BEFORE they serve, which is both Google's
// requirement and the only way this page stays true across the switch.
// The tense changes with the flag; the substance does not.

export default function PrivacyPage() {
  const host = SITE.url.replace("https://", "");
  const ads = adsLive();
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
          No name, email address, phone number, demat or bank details, and no
          financial information of any kind. We never ask for them and there is
          nowhere on the site to enter them. The search box on the dashboard
          filters the list inside your own browser — what you type is never
          sent anywhere.
        </p>

        <h2>The one exception: your PAN</h2>
        <p>
          The <Link href="/allotment">allotment page</Link> has a box for PAN
          numbers, so that it can hand you the right registrar with your PAN
          ready to paste into their form. That is the only place on this site
          that asks for anything personal, and it is worth being precise about
          what happens to it.
        </p>
        <p>
          <strong>A PAN you type there never reaches us.</strong> There is no
          request on that page that carries one — not to our server, not to our
          database, not to any third party. It is saved in your own
          browser&apos;s local storage and read back by the page on your own
          device. It is never put in a web address either, which would have
          placed it in your browser history and in the logs of every machine
          the request passed through.
        </p>
        <p>
          We also do not fetch your allotment result. Every registrar puts that
          behind a CAPTCHA, so opening their page and reading the answer stays
          with you; anything you record afterwards is a note to yourself, kept
          in the same browser storage.
        </p>

        <h2>What is stored in your browser</h2>
        <p>
          Four things, all in local storage on your own device, none of them
          cookies, and none of them ever sent anywhere:
        </p>
        <ul className="policy-list">
          <li>
            <code>theme</code> — whether you chose light or dark.
          </li>
          <li>
            <code>ipo-pans</code> — the PAN numbers you added on the allotment
            page.
          </li>
          <li>
            <code>ipo-allotment-picks</code> — which issues you selected there.
          </li>
          <li>
            <code>ipo-allotment-marks</code> — what you recorded after checking
            each one with its registrar.
          </li>
        </ul>
        <p>
          Clearing your browser data for this site removes all four, and the
          allotment page has an <strong>Erase everything</strong> button that
          does the same thing in one tap. The app also caches pages through a
          service worker so it opens quickly and still works on a poor
          connection; that cache holds public IPO pages, nothing about you.
        </p>
        <p>
          {ads ? (
            <>
              We set no analytics or tracking cookies of our own. Advertising
              cookies are a separate matter and are set by Google, not by us —
              the section below says what they do and how to refuse them.
            </>
          ) : (
            <>
              We set <strong>no</strong> advertising, tracking or analytics
              cookies today. There are none to reject, which is why you are
              not asked. Advertising is planned, and the section below
              describes what will change when it arrives.
            </>
          )}
        </p>

        <h2>Advertising</h2>
        <p>
          {ads
            ? "This site carries advertising served by Google AdSense."
            : "This site will carry advertising served by Google AdSense. Nothing described in this section is happening yet — it is set out in advance because a policy that only mentions ads after they appear is a policy nobody read in time."}
        </p>
        <p>
          Google and its partners use cookies and similar identifiers to serve
          and measure those ads, including showing ads based on pages you have
          visited on this and other sites. That processing is Google&apos;s,
          under{" "}
          <a
            href="https://policies.google.com/technologies/partner-sites"
            target="_blank"
            rel="noopener noreferrer"
          >
            their advertising policy
          </a>
          , and not something we can see: we receive no personal data from it
          and cannot identify anyone from it. What reaches us is a count of
          impressions and earnings, with nobody attached.
        </p>
        <p>
          You can turn personalised advertising off entirely at{" "}
          <a
            href="https://myadcenter.google.com/"
            target="_blank"
            rel="noopener noreferrer"
          >
            Google My Ad Center
          </a>
          , or block third-party cookies in your browser. Ads may still appear
          after that; they simply stop being chosen from anything about you.
        </p>
        <p>
          Readers in the EEA, the UK and Switzerland are asked for consent
          before any advertising cookie is set, through a consent tool
          certified by Google, and can change that answer at any time.
        </p>
        <p>
          <strong>Two places will never carry an ad.</strong> The{" "}
          <Link href="/allotment">allotment page</Link>, because it asks for a
          PAN and an advertising script has no business on a screen where a
          government identifier is typed; and the offer documents served
          through this site, which are handed over exactly as the exchange
          published them.
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

        <h2>Your rights, and the DPDP Act</h2>
        <p>
          India&apos;s Digital Personal Data Protection Act, 2023 places its
          duties on whoever determines how personal data is processed and
          actually holds it. We hold none. A PAN entered on the allotment page
          is processed on your own device, by code running in your own browser,
          and is never transmitted to or stored by us — so there is no copy of
          it for us to disclose, correct, export or erase, and no consent
          notice we could meaningfully serve for data we never receive.
        </p>
        <p>
          What that means in practice: the rights of access, correction,
          erasure and grievance redressal exist against whoever holds your
          data, and for the PAN on that page, that is you. Deleting it is the
          Erase everything button, or clearing this site&apos;s browser data.
        </p>
        <p>
          Advertising is the one thing that does not run through us at all.
          Whatever Google sets and reads for ads is held by Google, and the
          rights over it are exercised with them — the links in the
          Advertising section above are where that is done.
        </p>
        <p>
          If we ever start receiving PANs — which would mean fetching allotment
          results ourselves rather than sending you to the registrar — we would
          become a Data Fiduciary under the Act, with duties of notice,
          consent, purpose limitation, retention limits and breach reporting.
          We are not doing that, and this page will be rewritten in full before
          we ever do.
        </p>

        <h2>Changes to this policy</h2>
        <p>
          If we ever begin collecting anything — analytics, accounts, alerts
          that need an email address, or a PAN that reaches our server — this
          page will be updated with a new effective date <em>before</em> that
          change goes live, not after. That promise was broken once: the
          allotment page shipped on 2 September 2026 with a PAN box while this
          policy still said there was nowhere on the site to enter one. It was
          corrected the next day, and the correction is recorded here rather
          than quietly patched.
        </p>

        <h2>Contact</h2>
        <p>
          Questions about this policy, or a request about data held on your
          device, go to our <Link href="/contact">contact page</Link>.
        </p>

        <p className="back-row">
          <Link href="/">← Back to all IPOs</Link> ·{" "}
          <Link href="/terms">Terms of Use</Link>
        </p>
      </article>
    </div>
  );
}
