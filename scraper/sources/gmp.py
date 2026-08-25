"""
GMP source — grey market premium.

GMP is unofficial: no exchange or regulator publishes it, so it can only come
from a third-party site or from your own manual entry.

This module is deliberately isolated so sources can be swapped or switched
off without touching anything else. `fetch(ipo_rows)` reads the PRIMARY
source (config.GMP_SOURCE) and then, for any IPO still without a premium,
falls through the fallbacks (config.GMP_FALLBACKS) in order.

    GMP_SOURCE=investorgain  -> primary (JSON report API, richest & freshest)
    GMP_FALLBACKS=ipowatch,ipocentral -> fill gaps from server-rendered HTML
    GMP_SOURCE=none          -> disabled; enter GMP by hand and add 'gmp' to
                                the row's `locked` array so it is never
                                overwritten.

HTML sources are parsed by their header row and gated on robots.txt. The
investorgain source uses its public JSON data endpoint (the same one its own
page calls), so no HTML scraping or bot-detection bypass is involved.

Etiquette built in (do not remove):
  * robots.txt is fetched and honoured before any request
  * a descriptive User-Agent identifies the bot
  * exactly one page request per run, with a delay

Before enabling a source in production, check that site's terms of use —
republishing scraped data may not be permitted even when robots.txt allows
crawling.
"""

import datetime
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


GMP_HEADER = re.compile(r"\bgmp\b|grey market", re.I)
NAME_HEADER = re.compile(r"name|company|\bipo\b", re.I)
NAME_SUFFIX = re.compile(r"\s+(SME|Mainboard|IPO|BSE SME|NSE SME)\s*$", re.I)


def _header_map(cells):
    """(name_idx, gmp_idx) if this row is a header that names a GMP column.

    Header cells may be <th> OR <td> — several GMP sites style the header
    row as plain <td>s. '%' and 'gain' columns are different quantities and
    are skipped.
    """
    name_idx = gmp_idx = None
    for index, text in enumerate(cells):
        lowered = text.lower()
        if (
            gmp_idx is None
            and GMP_HEADER.search(lowered)
            and "%" not in lowered
            and "gain" not in lowered
        ):
            gmp_idx = index
        if name_idx is None and NAME_HEADER.search(lowered):
            name_idx = index
    if gmp_idx is None:
        return None
    return (name_idx if name_idx is not None else 0), gmp_idx


def _clean_name(text):
    return NAME_SUFFIX.sub("", text or "").strip()


def parse_gmp_table(html):
    """Extract {slug: gmp} from every table on a GMP page.

    Per table: find the header row (th or td) that names a GMP column, then
    read name + GMP from the columns it declares. Relying on the header
    matters — a page can hold a live table ("Name | GMP | Price ...") AND a
    history table ("Name | Price | GMP | Listing"), and a "first numeric
    cell" guess would store the price as the premium in the second one.

    A table with no recognisable header falls back to that positional guess.
    When the same company appears in several tables the FIRST occurrence
    wins, because live tables precede history tables on the pages we read.
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

    for table in soup.find_all("table"):
        rows = []
        for tr in table.find_all("tr"):
            cells = [c.get_text(" ", strip=True) for c in tr.find_all(["td", "th"])]
            if cells:
                rows.append(cells)

        header_at, mapping = None, None
        for index, cells in enumerate(rows[:5]):  # header sits near the top
            mapping = _header_map(cells)
            if mapping:
                header_at = index
                break

        if mapping:
            name_idx, gmp_idx = mapping
            for cells in rows[header_at + 1:]:
                if max(name_idx, gmp_idx) >= len(cells):
                    continue
                name = _clean_name(cells[name_idx])
                if len(name) < 4:
                    continue
                value = _parse_premium(cells[gmp_idx])
                if value is None:
                    continue
                slug = slugify(name)
                if slug:
                    results.setdefault(slug, value)
            continue

        # Fallback: no header — first cell is the name, first premium-looking
        # cell after it is the GMP.
        for cells in rows:
            if len(cells) < 2:
                continue
            name = _clean_name(cells[0])
            if len(name) < 4 or name.lower().startswith("ipo name"):
                continue
            value = None
            for cell in cells[1:]:
                value = _parse_premium(cell)
                if value is not None:
                    break
            if value is None:
                continue
            slug = slugify(name)
            if slug:
                results.setdefault(slug, value)

    return results


def _find_gmp_column(soup):
    """GMP column index of the first header row on the page (kept for
    tests/debugging; parse_gmp_table resolves headers per table)."""
    for row in soup.find_all("tr"):
        cells = [c.get_text(" ", strip=True) for c in row.find_all(["td", "th"])]
        mapping = _header_map(cells) if cells else None
        if mapping:
            return mapping[1]
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


def _fiscal_year(today):
    """Indian fiscal year label 'YYYY-YY' (April–March) for a date."""
    if today.month >= 4:
        return f"{today.year}-{str((today.year + 1) % 100).zfill(2)}"
    return f"{today.year - 1}-{str(today.year % 100).zfill(2)}"


def parse_investorgain_gmp(cell):
    """'₹<b>25</b> (30.12%)...' -> 25.0 ; '₹<b>--</b> ...' -> None."""
    match = re.search(r">\s*(-?[\d,]+(?:\.\d+)?)\s*<", cell or "")
    if not match:
        return None
    try:
        return float(match.group(1).replace(",", ""))
    except ValueError:
        return None


def _fetch_investorgain(ipo_rows):
    """Primary source: investorgain's JSON report API.

    Returns {slug: gmp} for IPOs that currently have a GMP. IPOs the API
    lists with '--' (no premium yet) are intentionally absent, so a fallback
    can supply them.
    """
    source = config.GMP_SOURCES["investorgain"]
    today = datetime.date.today()
    url = source["url_template"].format(
        month=today.month, year=today.year, fiscal=_fiscal_year(today)
    )
    try:
        time.sleep(config.DELAY_SECONDS)
        response = requests.get(
            url,
            headers={
                "User-Agent": config.SCRAPER_USER_AGENT,
                "Accept": "application/json, text/plain, */*",
                "Referer": source["referer"],
                "Origin": "https://www.investorgain.com",
            },
            timeout=config.REQUEST_TIMEOUT_SECONDS,
        )
        response.raise_for_status()
        rows = response.json().get("reportTableData") or []
    except (requests.RequestException, ValueError) as error:
        print(f"  GMP[investorgain] fetch failed: {error}")
        return {}

    scraped = {}
    for row in rows:
        name = (row.get("~ipo_name") or "").strip()
        if not name:
            continue
        value = parse_investorgain_gmp(row.get("GMP", ""))
        if value is not None:
            scraped[slugify(name)] = value
    return match_to_ipos(scraped, ipo_rows)


def _fetch_html_source(name, ipo_rows):
    """Fallback source: a server-rendered HTML GMP table (robots-honoured)."""
    source = config.GMP_SOURCES[name]
    url = source["base_url"] + source["path"]
    if not _robots_allows(url, config.SCRAPER_USER_AGENT):
        print(f"  GMP[{name}] skipped: robots.txt disallows {url}")
        return {}
    try:
        time.sleep(config.DELAY_SECONDS)
        response = requests.get(
            url,
            headers={"User-Agent": config.SCRAPER_USER_AGENT, "Accept": "text/html"},
            timeout=config.REQUEST_TIMEOUT_SECONDS,
        )
        response.raise_for_status()
    except requests.RequestException as error:
        print(f"  GMP[{name}] fetch failed: {error}")
        return {}
    return match_to_ipos(parse_gmp_table(response.text), ipo_rows)


def _fetch_one(name, ipo_rows):
    source = config.GMP_SOURCES.get(name)
    if not source:
        print(f"  GMP: unknown source '{name}' — skipped")
        return {}
    if source.get("type") == "investorgain_api":
        return _fetch_investorgain(ipo_rows)
    return _fetch_html_source(name, ipo_rows)


def source_order():
    """Primary source first, then each fallback once (deduped)."""
    order = []
    for name in [config.GMP_SOURCE, *config.GMP_FALLBACKS]:
        if name and name != "none" and name not in order:
            order.append(name)
    return order


def fetch(ipo_rows):
    """Return {slug: gmp}, filling gaps down the source chain.

    The primary source wins wherever it has a value; each fallback only adds
    IPOs still missing, so one incomplete site never blanks an IPO out.
    """
    if config.GMP_SOURCE == "none":
        return {}

    result = {}
    for name in source_order():
        missing = [row for row in ipo_rows if row["slug"] not in result]
        if not missing:
            break
        got = _fetch_one(name, missing)
        added = 0
        for slug, value in got.items():
            if slug not in result:
                result[slug] = value
                added += 1
        print(f"  GMP[{name}]: matched {len(got)}, newly filled {added}")

    print(f"  GMP: {len(result)}/{len(ipo_rows)} IPOs have a premium")
    return result
