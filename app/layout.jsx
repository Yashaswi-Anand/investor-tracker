import { Plus_Jakarta_Sans } from "next/font/google";
import Link from "next/link";
import { SITE } from "../lib/config";
import Logo from "./components/Logo";
import ServiceWorker from "./components/ServiceWorker";
import ThemeToggle from "./components/ThemeToggle";
import ScrollJump from "./components/ScrollJump";
import SiteMenu from "./components/SiteMenu";
import "./globals.css";

export const metadata = {
  metadataBase: new URL(SITE.url),
  title: {
    default: `${SITE.name} — Live IPO Tracker: GMP, Subscription, Allotment & Listing`,
    template: `%s | ${SITE.name}`,
  },
  description: SITE.description,
  applicationName: SITE.name,
  keywords: [
    "IPO tracker",
    "IPO GMP today",
    "IPO subscription status",
    "upcoming IPO",
    "SME IPO",
    "IPO allotment status",
    "IPO listing date",
    "IPO price band lot size",
  ],
  openGraph: {
    siteName: SITE.name,
    type: "website",
    url: SITE.url,
    title: `${SITE.name} — Live IPO Tracker`,
    description: SITE.description,
  },
  twitter: { card: "summary" },
  icons: {
    icon: [{ url: "/icons/favicon.png", type: "image/png" }],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180" }],
  },
  // No robots directive here either, for the same reason as the canonical
  // below: index,follow is already the default, so stating it in the ROOT
  // layout bought nothing and was inherited by Next's not-found boundary —
  // which emits its own noindex first, leaving every 404 carrying two
  // contradictory robots tags. Pages that need noindex say so themselves.
  // No canonical here. A canonical in the ROOT layout is inherited by every
  // page that does not set its own — which includes Next's not-found
  // boundary, so a 404 was serving `canonical: https://investor...` and
  // pointing at the homepage while also carrying two contradictory robots
  // tags. The homepage sets its own canonical in app/page.jsx, as does
  // every other route, so nothing loses one by removing it from here.
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: SITE.shortName,
  },
  formatDetection: { telephone: false },
  // Only when a token is configured — an empty verification block would put
  // <meta name="google-site-verification" content=""> on every page, which
  // is worse than absent because it looks like a failed attempt.
  ...(SITE.googleVerification
    ? { verification: { google: SITE.googleVerification } }
    : {}),
};

export const viewport = {
  themeColor: SITE.themeColor,
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

/**
 * Runs before first paint: restores the user's saved theme so the page never
 * flashes the wrong colours. Kept tiny and dependency-free on purpose.
 */
// Applies the stored theme before first paint, so a dark-mode reader never
// sees a flash of the light palette. The chrome colour is read from
// `--theme-bar` in globals.css rather than repeated here — no colour literal
// belongs in a script. If the stylesheet has not applied yet the value is
// empty and the meta tag is left as served.
const THEME_INIT = `(function(){try{var t=localStorage.getItem("theme");if(t!=="dark"&&t!=="light")return;var r=document.documentElement;r.setAttribute("data-theme",t);var m=document.querySelector('meta[name="theme-color"]');if(!m)return;var b=getComputedStyle(r).getPropertyValue("--theme-bar").trim();if(b)m.setAttribute("content",b)}catch(e){}})();`;

/**
 * Recovers from a chunk that is no longer on the server.
 *
 * A deploy replaces every hashed filename, so HTML served moments before it
 * asks for scripts that have just been deleted. React then cannot hydrate and
 * the reader gets a blank page reading "Application error: a client-side
 * exception has occurred". Reloading fixes it, because the fresh HTML names
 * the files that now exist — so do that automatically instead of leaving a
 * dead page on screen.
 *
 * Runs before React, because if hydration is what failed no effect of ours
 * will ever run. Rate-limited rather than once-only: a tight loop would be
 * worse than the bug, but a genuine second deploy an hour later still heals.
 */
const CHUNK_RECOVERY = `(function(){var K="ipo-chunk-reload";addEventListener("error",function(e){var el=e.target;if(!el||el.tagName!=="SCRIPT")return;if(String(el.src||"").indexOf("/_next/static/")<0)return;try{var last=parseInt(sessionStorage.getItem(K)||"0",10);if(Date.now()-last<15000)return;sessionStorage.setItem(K,String(Date.now()))}catch(err){return}location.reload()},true)})();`;

/**
 * The typeface, self-hosted.
 *
 * It used to arrive as a <link> to fonts.googleapis.com — the one
 * render-blocking resource on the site, on a third-party origin, needing a
 * DNS lookup, a TLS handshake and a CSS round trip before the first
 * paragraph could paint, and two <link rel=preconnect> tags to soften a
 * cost that did not need paying. next/font fetches the files at build time,
 * serves them from our own origin, inlines the @font-face rules, and
 * computes a size-adjusted fallback so the swap does not shift the layout.
 */
const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  display: "swap",
  variable: "--font-jakarta",
  // The stack the CSS already names, so the adjusted metrics are computed
  // against what a reader actually sees before the webfont arrives.
  fallback: ["-apple-system", "BlinkMacSystemFont", "Segoe UI", "Roboto", "Arial"],
});

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={jakarta.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT }} />
        <script dangerouslySetInnerHTML={{ __html: CHUNK_RECOVERY }} />
      </head>
      <body>
        <header className="site-header">
          <div className="container">
            <Link href="/" className="brand" aria-label={`${SITE.name} — home`}>
              <Logo tagline="Track. Analyze. Invest" />
            </Link>
            <div className="header-actions">
              {/* One tab, not a nav bar: the site has exactly two places to
                  be, and a row of links where two would do is noise. */}
              <nav className="site-nav" aria-label="Sections">
                <Link href="/news" className="nav-link">
                  News
                </Link>
              </nav>
              <ThemeToggle />
              <SiteMenu />
            </div>
          </div>
        </header>

        <main>{children}</main>

        <footer className="disclaimer">
          <div className="container">
            <p className="disclaimer-text">
              <strong>Disclaimer:</strong> GMP (grey market premium) is
              unofficial and indicative only. This is not investment advice.
              Data is sourced from NSE and third parties — always verify on
              NSE/BSE before applying to any IPO.
            </p>
            <div className="footer-row">
              <div className="footer-links">
                <Link href="/">Live dashboard</Link>
                {/* Site-wide, so every IPO page is two clicks from every
                    other one and /allotment stops being an orphan. */}
                <Link href="/ipo">All IPOs</Link>
                <Link href="/allotment">Allotment status</Link>
                <Link href="/about">About</Link>
                <Link href="/editorial">Editorial Standards</Link>
                <Link href="/contact">Contact</Link>
                <Link href="/privacy">Privacy Policy</Link>
                <Link href="/terms">Terms of Use</Link>
                <a
                  href="https://www.nseindia.com/market-data/all-upcoming-issues-ipo"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  NSE Source
                </a>
              </div>
              <span>
                © {new Date().getFullYear()} {SITE.owner}. All rights reserved.
              </span>
            </div>
          </div>
        </footer>

        {/* Last in the document on purpose: a shortcut past the page belongs
            after the page, both for reading order and for tab order. */}
        <ScrollJump />

        <ServiceWorker />
      </body>
    </html>
  );
}
