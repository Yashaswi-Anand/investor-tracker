"""
Central configuration for the IPO scraper.

RULES
  * Every URL / endpoint path lives in THIS file only.
  * Secrets come from environment variables, never from code.
  * See .env.example for the full list of variables.
"""

import os

# ---------------------------------------------------------------------------
# Supabase (destination database, written via the REST API)
# ---------------------------------------------------------------------------
SUPABASE_URL = os.environ.get("SUPABASE_URL", "").rstrip("/")
SUPABASE_SERVICE_KEY = os.environ.get("SUPABASE_SERVICE_KEY", "")

SUPABASE_ENDPOINTS = {
    "ipos": "/rest/v1/ipos",
    "gmp_history": "/rest/v1/gmp_history",
    "subscription_history": "/rest/v1/subscription_history",
    "scrape_runs": "/rest/v1/scrape_runs",
}

# ---------------------------------------------------------------------------
# NSE — official exchange source. No API key required.
# Supplies: name, symbol, board, dates, price band, issue size, face value,
#           LOT SIZE and QIB/NII/Retail/total subscription.
# ---------------------------------------------------------------------------
NSE_BASE_URL = "https://www.nseindia.com"

NSE_ENDPOINTS = {
    "home": "/",                                            # cookie warm-up
    "upcoming": "/api/all-upcoming-issues?category=ipo",
    "current": "/api/ipo-current-issue",
    "detail": "/api/ipo-detail?symbol={symbol}&series={series}",
    "active_category": "/api/ipo-active-category?symbol={symbol}",
}

# NSE rejects requests that do not look like a browser.
NSE_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
    ),
    "Accept": "application/json, text/plain, */*",
    "Accept-Language": "en-US,en;q=0.9",
    "Referer": "https://www.nseindia.com/market-data/all-upcoming-issues-ipo",
}

# ---------------------------------------------------------------------------
# GMP source — grey market premium is unofficial, so no exchange publishes it.
# This block is deliberately isolated and swappable.
#
#   GMP_SOURCE = "none"     -> skip GMP; enter it by hand (protected by `locked`)
#   GMP_SOURCE = "ipowatch" -> read the public GMP tables on ipowatch.in
#
# Why ipowatch: its GMP page is server-rendered HTML (parseable without
# running JavaScript), robots.txt allows crawling, and its tables carry a
# header row naming the GMP column. Sites that load GMP via JavaScript or
# reCAPTCHA-gated XHR (e.g. investorgain) are deliberately NOT supported —
# we do not work around bot protection.
#
# Etiquette enforced by scraper/sources/gmp.py:
#   * robots.txt is fetched and honoured before any request
#   * one request per run (every 30 min), descriptive User-Agent
# GMP is unofficial and is shown with a disclaimer. Check the source site's
# terms before enabling in production.
# ---------------------------------------------------------------------------
GMP_SOURCE = os.environ.get("GMP_SOURCE", "none").lower()

GMP_SOURCES = {
    "ipowatch": {
        "base_url": "https://ipowatch.in",
        "path": "/ipo-grey-market-premium-latest-ipo-gmp/",
    },
}

SCRAPER_USER_AGENT = os.environ.get(
    "SCRAPER_USER_AGENT",
    "IPOTrackerBot/1.0 (personal IPO dashboard; contact via site)",
)

# ---------------------------------------------------------------------------
# Behaviour
# ---------------------------------------------------------------------------
REQUEST_TIMEOUT_SECONDS = int(os.environ.get("REQUEST_TIMEOUT_SECONDS", "30"))
DELAY_SECONDS = float(os.environ.get("DELAY_SECONDS", "1.5"))
MAX_RETRIES = int(os.environ.get("MAX_RETRIES", "3"))

# Scheduler interval (minutes) used by scheduler.py
INTERVAL_MINUTES = int(os.environ.get("INTERVAL_MINUTES", "30"))

# Fetch per-IPO detail (lot size etc). One extra request per IPO.
FETCH_DETAILS = os.environ.get("FETCH_DETAILS", "true").lower() == "true"


# ---------------------------------------------------------------------------
# URL builders
# ---------------------------------------------------------------------------
def supabase_url(key):
    return SUPABASE_URL + SUPABASE_ENDPOINTS[key]


def nse_url(key, **kwargs):
    return NSE_BASE_URL + NSE_ENDPOINTS[key].format(**kwargs)


def gmp_url():
    """Full URL of the configured GMP source, or None when disabled."""
    source = GMP_SOURCES.get(GMP_SOURCE)
    if not source:
        return None
    return source["base_url"] + source["path"]


def _placeholder(value):
    return not value or value.startswith("your-") or "example.com" in value


def validate():
    """Fail fast with a readable message instead of a stack trace."""
    problems = []
    if _placeholder(SUPABASE_URL):
        problems.append("SUPABASE_URL is not set (see scraper/.env)")
    if _placeholder(SUPABASE_SERVICE_KEY):
        problems.append("SUPABASE_SERVICE_KEY is not set (see scraper/.env)")
    if GMP_SOURCE not in ("none",) and GMP_SOURCE not in GMP_SOURCES:
        problems.append(
            f"GMP_SOURCE='{GMP_SOURCE}' is unknown. "
            f"Use 'none' or one of: {', '.join(GMP_SOURCES)}"
        )
    if problems:
        raise SystemExit("Cannot start:\n  - " + "\n  - ".join(problems))
