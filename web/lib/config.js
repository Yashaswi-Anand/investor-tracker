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
  themeColor: "#8f4429",
  backgroundColor: "#f7f2e8",
};

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
