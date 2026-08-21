import Link from "next/link";
import { SITE } from "../lib/config";
import ServiceWorker from "./components/ServiceWorker";
import "./globals.css";

export const metadata = {
  metadataBase: new URL(SITE.url),
  title: {
    default: `${SITE.name} — Live IPO GMP, Price Band, Subscription & Allotment`,
    template: `%s | ${SITE.name}`,
  },
  description: SITE.description,
  applicationName: SITE.name,
  keywords: [
    "IPO GMP today",
    "IPO subscription status",
    "upcoming IPO",
    "SME IPO",
    "IPO allotment status",
    "IPO price band",
  ],
  openGraph: {
    siteName: SITE.name,
    type: "website",
    url: SITE.url,
    title: `${SITE.name} — Live IPO GMP & Subscription`,
    description: SITE.description,
  },
  // "summary" not "summary_large_image": no OG image is generated, and
  // claiming a large image without one yields a broken card preview.
  twitter: { card: "summary" },
  icons: {
    icon: [{ url: "/icons/favicon.png", type: "image/png" }],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180" }],
  },
  robots: { index: true, follow: true },
  alternates: { canonical: "/" },
  // Makes the TWA / installed PWA feel native.
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

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <header className="site-header">
          <div className="container">
            <Link href="/" className="brand">
              <span className="brand-dot" aria-hidden="true" />
              {SITE.name}
            </Link>
            <span className="header-note">Updated every 30 min</span>
          </div>
        </header>

        <main>
          <div className="container">{children}</div>
        </main>

        <footer className="disclaimer">
          <div className="container">
            <p style={{ margin: 0 }}>
              <strong>Disclaimer:</strong> GMP (grey market premium) is
              unofficial and indicative only. This is not investment advice.
              Data is sourced from NSE and third parties — always verify on
              NSE/BSE before applying to any IPO.
            </p>
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
            <p style={{ marginBottom: 0 }}>
              © {new Date().getFullYear()} {SITE.name}
            </p>
          </div>
        </footer>

        <ServiceWorker />
      </body>
    </html>
  );
}
