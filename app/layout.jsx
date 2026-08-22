import Link from "next/link";
import { SITE } from "../lib/config";
import Logo from "./components/Logo";
import ServiceWorker from "./components/ServiceWorker";
import ThemeToggle from "./components/ThemeToggle";
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
  robots: { index: true, follow: true },
  alternates: { canonical: "/" },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: SITE.shortName,
  },
  formatDetection: { telephone: false },
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
const THEME_INIT = `(function(){try{var t=localStorage.getItem("theme");if(t==="dark"||t==="light"){document.documentElement.setAttribute("data-theme",t);var m=document.querySelector('meta[name="theme-color"]');if(m){m.setAttribute("content",t==="dark"?"#0a0e1a":"#4f46e5")}}}catch(e){}})();`;

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT }} />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <header className="site-header">
          <div className="container">
            <Link href="/" className="brand" aria-label={`${SITE.name} — home`}>
              <Logo tagline="IPO Tracker · India" />
            </Link>
            <div className="header-actions">
              <span className="live-pill">
                <span className="live-dot" aria-hidden="true" />
                Live · refreshes every 30 min
              </span>
              <ThemeToggle />
            </div>
          </div>
        </header>

        <main>{children}</main>

        <footer className="disclaimer">
          <div className="container">
            <p style={{ margin: 0 }}>
              <strong>Disclaimer:</strong> GMP (grey market premium) is
              unofficial and indicative only. This is not investment advice.
              Data is sourced from NSE and third parties — always verify on
              NSE/BSE before applying to any IPO.
            </p>
            <div className="footer-row">
              <div className="footer-links">
                <Link href="/">All IPOs</Link>
                <Link href="/privacy">Privacy Policy</Link>
                <a
                  href="https://www.nseindia.com/market-data/all-upcoming-issues-ipo"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  NSE Source
                </a>
              </div>
              <span>© {new Date().getFullYear()} {SITE.name}</span>
            </div>
          </div>
        </footer>

        <ServiceWorker />
      </body>
    </html>
  );
}
