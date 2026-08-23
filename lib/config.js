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
  themeColor: "#4f46e5",
  backgroundColor: "#f4f6fb",
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
 * Pages are rendered per request (no ISR) so the latest GMP is always shown —
 * see lib/data.js. Kept only as documentation of the scraper cadence.
 */
export const SCRAPER_INTERVAL_MINUTES = 30;

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
