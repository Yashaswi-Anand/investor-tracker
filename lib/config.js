/**
 * Central configuration for the website.
 * Every base URL and endpoint path lives here; keys come from env vars.
 */

export const SITE = {
  name: "Investor",
  shortName: "Investor",
  url: (process.env.NEXT_PUBLIC_SITE_URL || "https://investor.socialriser.com").replace(/\/$/, ""),
  description:
    "Live IPO tracker for India — every Mainboard and SME IPO with GMP and daily GMP history, subscription status, price band, lot size, allotment and listing dates.",
  // The only two colours outside globals.css, and they have to be: the web
  // manifest is JSON and the theme-color meta tag is served in the HTML, so
  // neither can read a CSS variable at build time. They mirror --theme-bar
  // and --bg from the light palette; change those and change these with them.
  themeColor: "#0f5d7a",
  backgroundColor: "#f2f6f7",
  // A reachable address is a condition of running ads, and the only contact
  // route this site has. Set NEXT_PUBLIC_CONTACT_EMAIL before applying to
  // AdSense: with it empty the contact page says so rather than printing a
  // placeholder nobody can write to.
  contactEmail: process.env.NEXT_PUBLIC_CONTACT_EMAIL || "",
};

/**
 * Advertising.
 *
 * TWO FLAGS, NOT ONE, AND THE ORDER MATTERS. `publisherId` is what ads.txt
 * needs and what a reviewer checks; `enabled` is what actually puts a script
 * on the page. They are separate so the disclosure can go up first — Google
 * requires the privacy policy to describe third-party ad cookies BEFORE ads
 * serve, and applying with a policy that says "we set no advertising
 * cookies" is how an application gets refused.
 *
 * The privacy page reads `enabled` and changes tense accordingly, so the
 * document is true on both sides of the switch. That is deliberate: this
 * site has twice shipped a feature and left a policy behind contradicting
 * it, and a flag both of them read is the only thing that stops a third.
 */
export const ADS = {
  // "pub-0000000000000000", from AdSense → Account → Settings.
  publisherId: process.env.NEXT_PUBLIC_ADSENSE_ID || "",
  // Flip once approved. Without an id it stays off whatever this says.
  enabled: process.env.NEXT_PUBLIC_ADS_ENABLED === "true",
};

/** Ads only ever run when there is an id to run them under. */
export const adsLive = () => Boolean(ADS.enabled && ADS.publisherId);

export const SUPABASE = {
  url: (process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/$/, ""),
  anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "",
  endpoints: {
    ipos: "/rest/v1/ipos",
    gmpHistory: "/rest/v1/gmp_history",
    subscriptionHistory: "/rest/v1/subscription_history",
  },
};

/**
 * IPO news.
 *
 * The Economic Times IPO feed, which is published for syndication and whose
 * robots.txt allows it (`User-agent: *` / `Allow: /`; none of its disallow
 * rules touch /rssfeeds/). Checked before this was wired up.
 *
 * Google News RSS was the obvious first choice and is NOT used: its
 * robots.txt is `Disallow: /` with an allow-list that does not include
 * /rss/, and this project honours robots.txt everywhere else.
 *
 * `revalidateSeconds` is the whole politeness story on the web side. The
 * pages are force-dynamic, so without it every visitor would cost the
 * publisher a request; with it they cost at most four an hour between them.
 */
export const NEWS = {
  feedUrl:
    process.env.NEWS_FEED_URL ||
    "https://economictimes.indiatimes.com/markets/ipos/fpos/rssfeeds/14655708.cms",
  publisher: "The Economic Times",
  publisherUrl: "https://economictimes.indiatimes.com/markets/ipos/fpos",
  revalidateSeconds: 900,
  userAgent:
    "InvestorTracker/1.0 (+https://investor.socialriser.com; contact via site)",
};

/**
 * NSE, for the live quote and the intraday chart on listed issues.
 *
 * The same site the scraper reads issue data from, and the same rule: it is
 * asked from our server, never from the reader's browser, so NSE never sees
 * a visitor. Everything goes through their newer NextApi, which is what
 * nseindia.com's own quote page calls; the older quote-equity endpoint now
 * answers 403 and chart-databyindex answers with an empty shell.
 *
 * NSE wants a cookie from a real page before its API will talk. `seedPath`
 * is the page we ask first; the headers are what a browser arriving from it
 * would send. The identifiers below are NSE's own: symbol + series + market
 * type, e.g. SKYWAYSEQN — and getSymbolData hands the exact string back in
 * metaData.identifier, which is what the chart call then uses.
 */
export const NSE = {
  baseUrl: "https://www.nseindia.com",
  seedPath: "/market-data/all-upcoming-issues-ipo",
  api: "/api/NextApi/apiClient/GetQuoteApi",
  functions: {
    meta: "getMetaData",
    quote: "getSymbolData",
    chart: "getSymbolChartData",
  },
  marketType: "N",
  headers: {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
    Accept: "application/json, text/plain, */*",
    "Accept-Language": "en-US,en;q=0.9",
    Referer: "https://www.nseindia.com/market-data/all-upcoming-issues-ipo",
  },
  timeoutMs: 12000,
  // How long one answer is reused before NSE is asked again. Thirty seconds
  // while the market trades is live enough for anyone not day-trading off
  // this page, and means NSE gets at most two requests a minute per symbol
  // however many people are looking. Outside hours nothing changes, so the
  // answer is good for five minutes.
  cacheOpenSeconds: 30,
  cacheClosedSeconds: 300,
  // The warmed cookie jar is kept this long before a fresh seed request.
  sessionSeconds: 600,
};

export function supabaseUrl(key) {
  return SUPABASE.url + SUPABASE.endpoints[key];
}

export function supabaseHeaders() {
  return {
    apikey: SUPABASE.anonKey,
    Authorization: `Bearer ${SUPABASE.anonKey}`,
    Accept: "application/json",
  };
}

export const isConfigured = () => Boolean(SUPABASE.url && SUPABASE.anonKey);
