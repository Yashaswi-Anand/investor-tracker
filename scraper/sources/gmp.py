"""
GMP source — grey market premium.

GMP is unofficial: no exchange or regulator publishes it, so it can only come
from a third-party site or from your own manual entry.

This module is deliberately isolated so it can be swapped or switched off
without touching anything else:

    GMP_SOURCE=none          -> disabled (default). Enter GMP by hand; add
                                'gmp' to the row's `locked` array and the
                                scraper will never overwrite it.
    GMP_SOURCE=investorgain  -> scrape the public GMP table.

Etiquette built in (do not remove):
  * robots.txt is fetched and honoured before any request
  * a descriptive User-Agent identifies the bot
  * exactly one page request per run, with a delay

Before enabling a source in production, check that site's terms of use —
republishing scraped data may not be permitted even when robots.txt allows
crawling.
"""

import re
import time
import urllib.robotparser
from urllib.parse import urlparse

import requests

import config
from util import slugify, to_float

SOURCE_NAME = "gmp"


def _robots_allows(url, user_agent):
    """True when robots.txt permits fetching `url`. Fails closed on error."""
    parsed = urlparse(url)
    robots_url = f"{parsed.scheme}://{parsed.netloc}/robots.txt"
    parser = urllib.robotparser.RobotFileParser()
    try:
        response = requests.get(
            robots_url,
            headers={"User-Agent": user_agent},
            timeout=config.REQUEST_TIMEOUT_SECONDS,
        )
        if response.status_code >= 400:
            # No robots.txt published -> crawling is permitted by convention.
            return True
        parser.parse(response.text.splitlines())
        return parser.can_fetch(user_agent, url)
    except requests.RequestException:
        return False


def parse_gmp_table(html):
    """Extract {slug: gmp} from an HTML page containing a GMP table.

    Tolerant by design: sites restyle constantly, so this looks for table
    rows where one cell is a company name and another is a rupee premium,
    rather than depending on exact class names.
    """
    try:
        from bs4 import BeautifulSoup
    except ImportError:
        raise SystemExit(
            "beautifulsoup4 is required for GMP scraping. "
            "Run: pip install -r requirements.txt"
        )

    soup = BeautifulSoup(html, "html.parser")
    results = {}

    # Which column actually holds the GMP.
    #
    # Taking the first numeric cell after the name would silently pick up
    # whatever column happens to come first — price, lot size, issue size —
    # and store it as a premium. The header is checked first; only if no
    # header names a GMP column do we fall back to positional scanning.
    gmp_column = _find_gmp_column(soup)

    for row in soup.find_all("tr"):
        cells = [c.get_text(" ", strip=True) for c in row.find_all(["td", "th"])]
        if len(cells) < 2:
            continue

        # First cell that reads like a company name.
        name = cells[0]
        if not name or len(name) < 4 or name.lower().startswith("ipo name"):
            continue
        # Strip trailing tags sites add, e.g. "Acme Ltd SME" / "Acme IPO"
        name = re.sub(r"\s+(SME|Mainboard|IPO|BSE SME|NSE SME)\s*$", "", name, flags=re.I)

        if gmp_column is not None and gmp_column < len(cells):
            value = _parse_premium(cells[gmp_column])
            if value is not None:
                slug = slugify(name)
                if slug:
                    results[slug] = value
            continue

        # Fallback: no GMP header found, so take the first cell that parses
        # as a premium.
        gmp = None
        for cell in cells[1:]:
            gmp = _parse_premium(cell)
            if gmp is not None:
                break
        if gmp is None:
            continue

        slug = slugify(name)
        if slug:
            results[slug] = gmp

    return results


def _find_gmp_column(soup):
    """Index of the column whose header names the grey market premium."""
    for row in soup.find_all("tr"):
        headers = [c.get_text(" ", strip=True).lower() for c in row.find_all("th")]
        if not headers:
            continue
        for index, text in enumerate(headers):
            # "GMP", "GMP (₹)", "Grey Market Premium" — but not
            # "GMP %" / "Est Listing Gain", which are different quantities.
            if "%" in text or "gain" in text:
                continue
            if re.search(r"\bgmp\b", text) or "grey market" in text:
                return index
    return None


def _parse_premium(cell):
    """Parse one cell as a rupee premium, or None if it is not one.

    The sign may sit before or after the currency symbol and may be separated
    by spaces ("-4", "- 4", "-₹4", "₹ -4", "Rs. -4"), so it is captured
    separately and applied to the magnitude rather than left to to_float,
    whose regex requires the sign to touch the first digit.
    """
    match = re.fullmatch(
        r"\s*(?P<pre>[-+])?\s*(?:₹|Rs\.?|INR)?\s*(?P<post>[-+])?\s*"
        r"(?P<num>[\d,]+(?:\.\d+)?)\s*",
        cell or "",
        flags=re.I,
    )
    if not match:
        return None
    magnitude = to_float(match.group("num"))
    if magnitude is None:
        return None
    negative = "-" in (match.group("pre") or "") + (match.group("post") or "")
    return -abs(magnitude) if negative else magnitude


def match_to_ipos(gmp_by_slug, ipo_rows):
    """Map scraped GMP onto our IPO rows.

    Site names rarely match NSE names exactly ('Acme Ltd' vs 'Acme Limited'),
    so an exact slug match is tried first, then a prefix match on the first
    three words.

    An ambiguous prefix is skipped rather than guessed: if two listed
    companies share an opening ("Sumax Engineering Limited" and "Sumax
    Engineering Services"), taking the first candidate would silently print
    one company's premium on the other company's page.
    """
    matched = {}
    for row in ipo_rows:
        slug = row["slug"]
        if slug in gmp_by_slug:
            matched[slug] = gmp_by_slug[slug]
            continue

        key = "-".join(slug.split("-")[:3])
        if len(key) < 8:
            continue

        candidates = [
            (other, value)
            for other, value in gmp_by_slug.items()
            if other.startswith(key) or key.startswith(other)
        ]
        if len(candidates) == 1:
            matched[slug] = candidates[0][1]
        elif len(candidates) > 1:
            print(
                f"  GMP: skipped '{slug}' — {len(candidates)} ambiguous matches"
            )
    return matched


def fetch(ipo_rows):
    """Return {slug: gmp}. Empty dict when disabled or blocked."""
    if config.GMP_SOURCE == "none":
        return {}

    url = config.gmp_url()
    if not url:
        return {}

    user_agent = config.SCRAPER_USER_AGENT
    if not _robots_allows(url, user_agent):
        print(f"  GMP skipped: robots.txt disallows {url}")
        return {}

    try:
        time.sleep(config.DELAY_SECONDS)
        response = requests.get(
            url,
            headers={"User-Agent": user_agent, "Accept": "text/html"},
            timeout=config.REQUEST_TIMEOUT_SECONDS,
        )
        response.raise_for_status()
    except requests.RequestException as error:
        print(f"  GMP fetch failed: {error}")
        return {}

    scraped = parse_gmp_table(response.text)
    matched = match_to_ipos(scraped, ipo_rows)
    print(f"  GMP: {len(scraped)} rows on page, {len(matched)} matched to our IPOs")
    return matched
