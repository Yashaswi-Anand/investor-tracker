/**
 * Central configuration for the website.
 * Every base URL and endpoint path lives here; keys come from env vars.
 */

export const SITE = {
  name: "Investor",
  shortName: "Investor",
  url: (process.env.NEXT_PUBLIC_SITE_URL || "https://investor.socialriser.com").replace(/\/$/, ""),
  description:
    "Live IPO tracker for India — GMP, price band, lot size, subscription status, allotment and listing dates for Mainboard and SME IPOs.",
  themeColor: "#1f4fd8",
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

/** ISR window in seconds. The scraper runs every 30 min; refresh every 10. */
export const REVALIDATE_SECONDS = 600;

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
