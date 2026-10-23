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
// SIGN-IN SHIPPED ON 23 OCT 2026, and this page changed in the same commit —
// which is the whole point of the rule above. Google sign-in is OPTIONAL and
// gates nothing: every IPO page is public and stays public. But an account
// now exists, Firebase holds a name, email and avatar for whoever makes one,
// and a reader's browser now talks to Google's identity servers. All three
// are disclosed below. If sign-in is ever removed, this section goes with it.
//
// PAN STORAGE REVERSED THE SITE'S OLDEST PROMISE, on the owner's explicit
// instruction. Until now this page said a PAN never reached our server and
// that was true: it lived in the reader's own browser, and the KFin lookup
// was built browser-direct precisely so it stayed there. PANs now live in
// Firestore under the signed-in reader's uid. That makes this project a data
// fiduciary for a government identifier under the DPDP Act — so the section
// below states exactly what is held, where, who can reach it, and how to
// have it deleted. Phone sign-in shipped at the same time, which means a
// phone number is also held for anyone who uses it. If PAN storage is ever
// withdrawn, this section and the Play Console Data safety form go with it.
//
// THE ALLOTMENT PAGE ASKS FOR A PAN. That is personal data under the DPDP
// Act, and this page once said there was nowhere on the site to enter one —
// written before that page existed and left standing after it shipped, which
// made this document untrue for four days.
//
// The sentence that replaced it — "the PAN never reaches OUR server" — was
// true until 23 Oct 2026 and is not any more. PANs are stored in Firestore
// under the signed-in reader's uid. The KFin lookup is still browser-direct,
// so that specific claim survives for the LOOKUP; it no longer survives for
// storage. Both are stated separately below, because conflating them is how
// this page went wrong the first time.

// Static content, but not for a year.
//
// Next marks a prerendered page `s-maxage=31536000` on the assumption that a
// deploy purges the CDN. Hostinger's does not, so an edit to this page was
// invisible behind an edge copy until the cache felt like expiring — measured
// at an hour and a half old and counting, still serving text two commits out
// of date. Ten minutes is long enough that this costs nothing and short
// enough that a correction actually reaches a reader.
export const revalidate = 600;

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
          You can read every page on this site without telling us anything.
          There is no contact form, no analytics and no advertising on this
          site or in the Android app, and nothing you read here is recorded
          against you.
        </p>
        <p>
          There is <strong>one optional account</strong>, signed in with
          Google or a phone number. Every IPO page is public with or without
          it. What the account adds is the allotment check: that needs your
          PAN, and a PAN is only ever stored against an account. Browse
          without signing in and we never learn who you are.
        </p>

        <h2>What we do not collect</h2>
        <p>
          No phone number, no demat or bank details, and no financial
          information of any kind. We never ask for them and there is nowhere
          on the site to enter them. The search box on the dashboard filters
          the list inside your own browser — what you type is never sent
          anywhere.
        </p>
        <p>
          Your name, email address and profile picture are collected{" "}
          <strong>only if you choose to sign in</strong> — see the next
          section. Browse without signing in and none of it exists.
        </p>

        <h2>If you sign in with Google</h2>
        <p>
          Sign-in is entirely optional. Nothing on this site is hidden behind
          it: the dashboard, every IPO page, the news and the documents are
          public and stay public whether you sign in or not. The account page
          is the only page that requires one, and the only thing on it is you.
        </p>
        <p>
          There are two ways in and <strong>no password either way</strong> —
          we never see one.
        </p>
        <ul className="policy-list">
          <li>
            <strong>Google.</strong> Google tells us your name, your email
            address and your profile picture, and we keep those three.
          </li>
          <li>
            <strong>Phone.</strong> You give a number, Google texts a
            six-digit code, and we keep the number. No name, no email.
          </li>
        </ul>
        <p>
          They are held by <strong>Google Firebase Authentication</strong>, in
          a project controlled by {SITE.owner}, under{" "}
          <a
            href="https://firebase.google.com/support/privacy"
            target="_blank"
            rel="noopener noreferrer nofollow"
          >
            Google&apos;s privacy terms for Firebase
          </a>
          . We do not copy them into our own database, we do not build a
          profile from them, and we do not use them to track what you read —
          the pages you visit are not linked to your account anywhere.
        </p>
        <p>
          <strong>Deleting it.</strong> Sign out any time from your account
          page; that ends the session on your device. To remove the account
          and everything Firebase holds for it,{" "}
          <Link href="/contact">ask us</Link> and it will be deleted. You can
          also revoke this site&apos;s access from your{" "}
          <a
            href="https://myaccount.google.com/permissions"
            target="_blank"
            rel="noopener noreferrer nofollow"
          >
            Google account permissions
          </a>
          .
        </p>

        <h2>The one exception: your PAN</h2>
        <p>
          The <Link href="/allotment">allotment page</Link> has a box for PAN
          numbers, so that it can check your allotment for you where the
          registrar allows it, and hand you the right registrar with your PAN
          ready where it does not. That is the only place on this site that
          asks for anything personal, and it is worth being precise about what
          happens to it.
        </p>
        <p>
          <strong>A PAN you type there never reaches us.</strong> No request on
          that page goes to our server or our database. It is saved in your
          own browser&apos;s local storage and read back by the page on your
          own device. It is never put in a web address either, which would
          have placed it in your browser history and in the logs of every
          machine the request passed through.
        </p>
        <p>
          <strong>One request does carry it, and it does not come to us.</strong>{" "}
          For issues whose registrar is KFin Technologies, pressing Check sends
          the PAN from your browser directly to KFin&apos;s own allotment
          server — the same request their page makes when you use it there —
          and the answer comes back the same way. KFin receives it under{" "}
          <a
            href="https://www.kfintech.com/privacy-policy/"
            target="_blank"
            rel="noopener noreferrer nofollow"
          >
            their privacy policy
          </a>
          ; this site is not on the path and cannot see either the PAN or the
          answer. For every other registrar the answer sits behind a CAPTCHA,
          so opening their page and reading it stays with you, and anything you
          record afterwards is a note to yourself, kept in the same browser
          storage.
        </p>

        <h2>Your PAN, if you save one</h2>
        <p>
          <strong>This changed on 23 October 2026, and in your favour only
          partly — so it is worth reading.</strong> Until that date a PAN you
          typed here never left your browser, and this page said so. It now
          leaves: a PAN you save is stored in Google Firestore, in a document
          under your own account id, in Google&apos;s Mumbai region.
        </p>
        <p>
          We made that change so your PAN follows you between your phone and
          your computer instead of being stranded on one device. The cost is
          that {SITE.owner} now holds a government identifier, and under
          India&apos;s DPDP Act that carries real duties. Here is the whole of
          what we do:
        </p>
        <ul className="policy-list">
          <li>
            <strong>Only yours.</strong> Security rules on the database allow
            a signed-in reader to read and write documents under their own
            account id and nothing else. Not other readers&apos; — and that is
            enforced by the database, not by our code being careful.
          </li>
          <li>
            <strong>Only if you are signed in.</strong> There is no path that
            stores a PAN for a signed-out visitor — not in the database, not
            in your browser&apos;s storage, not anywhere. Sign out and
            anything PAN-shaped on the device is erased.
          </li>
          <li>
            <strong>Deleted means deleted.</strong> Remove a PAN and the
            document is deleted. There is no archive, no tombstone and no
            backup copy we keep — the project is on Firebase&apos;s free tier,
            which has no scheduled backups at all.
          </li>
          <li>
            <strong>Not used for anything else.</strong> We do not look at it,
            do not analyse it, do not link it to what you read, and never send
            it to a registrar ourselves. A KFin check still goes from your own
            browser straight to KFin, exactly as before.
          </li>
        </ul>
        <p>
          You can remove every PAN with the <strong>Erase everything</strong>{" "}
          button on the allotment page, or have the whole account and
          everything under it deleted by <Link href="/contact">asking us</Link>.
        </p>

        <h2>What is stored in your browser</h2>
        <p>
          The following sit in local storage on your own device, none of them
          cookies. Nothing in this list is ever sent to us:
        </p>
        <ul className="policy-list">
          <li>
            <code>theme</code> — whether you chose light or dark.
          </li>
          <li>
            <code>firebase:authUser:…</code> — written by Google&apos;s sign-in
            library, and only if you sign in. It is what keeps you signed in
            between visits. Signing out removes it.
          </li>
          <li>
            <code>ipo-pans</code> — the PAN numbers you added on the allotment
            page.
          </li>
          <li>
            <code>ipo-allotment-marks:&lt;your account id&gt;</code> — what you
            recorded after checking an issue on its registrar&apos;s site.
          </li>
          <li>
            <code>ipo-allotment-results:&lt;your account id&gt;</code> — what
            KFin answered for a PAN, kept so you do not have to ask again.
            Includes the applicant name as KFin holds it.
          </li>
          <li>
            Both of the above are written <strong>only while you are signed
            in</strong>, are named after your account id, and are erased the
            moment you sign out — their keys contain a PAN, and a signed-out
            browser should not hold one.
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
          actually holds it. For a PAN you save to your account, that is{" "}
          <strong>us</strong> — so the rights of access, correction, erasure
          and grievance redressal apply against {SITE.owner}, and the way to
          exercise them is the <Link href="/contact">contact page</Link> or
          the delete controls on the allotment page itself. Where your browser
          sends a PAN to KFin at your request, KFin is the fiduciary for that
          request, as it is when you use their own site.
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
