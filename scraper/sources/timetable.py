"""
Timetable source — allotment / refund / demat / listing dates, and registrar.

No exchange publishes these. NSE's ipo-detail carries the registrar NAME but
no timetable dates at all; BSE's public issue JSON carries neither, and its
robots.txt answers 403, so it is not used. The dates come from the issuer's
RHP timetable, which investorgain republishes on each IPO's own page.

TWO THINGS THAT SHAPE THIS MODULE

1. These are SCHEDULED dates, not facts. Until allotment actually happens the
   date is the issuer's plan and it can move. A live payload was observed
   carrying a listing date two days in the past while the same payload still
   classified that IPO as merely 'closed'. So: never let one of these dates be
   the sole evidence for an irreversible decision, and present them as
   expected dates rather than settled ones.

2. The request budget IS the design. The naive version — one detail page per
   IPO per run — is roughly 2,900 requests a day aimed at a site that owes us
   nothing, and is precisely what provokes the rate limiting we are trying to
   avoid. Instead:

     * nothing is requested at all unless some IPO is missing timetable data
     * ONE list request then fills allotment + listing for every IPO at once
     * a detail page is fetched only for IPOs still missing the registrar or
       the refund/demat dates, capped per run so a cold start spreads across
       several runs instead of arriving as a spike

   In steady state — every IPO already has its timetable — this module makes
   ZERO requests.

Values we did not find are OMITTED from the returned dict rather than set to
None, so a source going dark can never blank a date we already hold. See the
empty-value filter in db.apply_locks, which is what actually enforces that.
"""

import datetime
import json
import re
import time

import requests

import config
import util
from sources import company
from sources.gmp import fiscal_year, match_to_ipos, robots_allows

SOURCE_NAME = "timetable"

# Columns this module can supply.
COLUMNS = (
    "allotment_date", "refund_date", "demat_date", "listing_date",
    "registrar", "registrar_url",
)

# Column -> key in the detail page's embedded data. Verified against a live
# page: boa/refunds/share_credit arrive as ISO-8601 timestamps, while
# listing arrives as '1st Sep 2026' — util.to_date handles both.
DETAIL_DATE_KEYS = {
    "allotment_date": "timetable_boa_dt",
    "refund_date": "timetable_refunds_dt",
    "demat_date": "timetable_share_credit_dt",
    "listing_date": "timetable_listing_dt",
}

# The detail page is a Next.js app; its data arrives as RSC flight chunks
# rather than as a JSON blob in the markup.
_PUSH = "self.__next_f.push([1,"


def _missing_columns(existing_row):
    """Timetable columns this IPO still needs.

    A locked column is excluded: the point of locking is that the stored value
    wins, so re-fetching it would spend a request to produce something that
    apply_locks will discard anyway.
    """
    existing_row = existing_row or {}
    locked = set(existing_row.get("locked") or [])
    return {
        column
        for column in COLUMNS
        if column not in locked and not existing_row.get(column)
    }


def _needs_company(existing_row):
    """True when we have no description for this company yet.

    Without this the detail page is fetched only while a DATE is missing, so
    an IPO whose timetable arrived complete from the list payload would never
    have its page opened and would never get a description.
    """
    details = (existing_row or {}).get("details") or {}
    return not details.get("about")


def flight_payload(html):
    """Reassemble the RSC flight stream from its push() chunks.

    Each chunk is a JavaScript string literal, so the scan has to respect
    backslash escapes — a naive search for the closing quote would stop at the
    first escaped one and truncate the payload mid-record.
    """
    parts = []
    cursor = 0
    while True:
        start = html.find(_PUSH, cursor)
        if start < 0:
            break
        start += len(_PUSH)
        if start >= len(html) or html[start] != '"':
            cursor = start
            continue
        index = start + 1
        while index < len(html):
            char = html[index]
            if char == "\\":
                index += 2
                continue
            if char == '"':
                break
            index += 1
        try:
            parts.append(json.loads(html[start:index + 1]))
        except ValueError:
            pass  # a malformed chunk should not lose the rest of the payload
        cursor = index + 1
    return "".join(parts)


def json_string(text, key):
    """Value of a JSON string property named `key`, or None."""
    pattern = '"' + re.escape(key) + r'"\s*:\s*"((?:[^"\\]|\\.)*)"'
    match = re.search(pattern, text)
    if not match:
        return None
    try:
        return json.loads('"' + match.group(1) + '"')
    except ValueError:
        return None


def parse_registrar(flight):
    """(name, url) from the registrarInfo block; either may be None.

    The URL is not its own field — it sits inside an HTML blurb, labelled
    'Website:'. Anchors also appear for the phone and email rows, so the
    label is what disambiguates them; only if that fails do we take the first
    http link in the block.
    """
    name = json_string(flight, "registrar_name")
    info = json_string(flight, "registrar_basic_info") or ""

    match = re.search(r"Website:.*?href=\"(https?://[^\"]+)\"", info, re.I | re.S)
    if not match:
        match = re.search(r"href=\"(https?://[^\"]+)\"", info, re.I)
    url = match.group(1) if match else None

    return (name.strip() if name else None), url


def _headers(source, accept):
    return {
        "User-Agent": config.SCRAPER_USER_AGENT,
        "Accept": accept,
        "Referer": source["referer"],
        "Origin": source["origin"],
    }


def _fetch_list(source, ipo_rows):
    """One request: {slug: {path, allotment_date, listing_date}} for our rows."""
    today = datetime.date.today()
    url = source["list_url_template"].format(
        month=today.month, year=today.year, fiscal=fiscal_year(today)
    )
    if not robots_allows(url, config.SCRAPER_USER_AGENT):
        print("  timetable: robots.txt disallows the list endpoint")
        return {}

    time.sleep(config.DELAY_SECONDS)
    response = requests.get(
        url,
        headers=_headers(source, "application/json, text/plain, */*"),
        timeout=config.REQUEST_TIMEOUT_SECONDS,
    )
    response.raise_for_status()
    rows = response.json().get("reportTableData") or []

    by_slug = {}
    for row in rows:
        slug = util.slugify(row.get("~ipo_name"))
        if not slug:
            continue
        by_slug[slug] = {
            "path": row.get("~urlrewrite_folder_name"),
            "allotment_date": util.to_date(row.get("~Srt_BoA_Dt")),
            "listing_date": util.to_date(row.get("~Str_Listing")),
        }
    # Reuses the GMP matcher, which skips ambiguous name prefixes rather than
    # guessing. That matters more here than it does for GMP: a premium on the
    # wrong company is embarrassing, an allotment date on the wrong company
    # sends someone to check their application on the wrong day.
    return match_to_ipos(by_slug, ipo_rows, label="timetable")


def _fetch_detail(source, path):
    """One IPO's detail page -> {column: value} for whatever it publishes."""
    # The path comes from a third-party payload, so it is checked before being
    # joined onto our base URL — an absolute or protocol-relative value would
    # otherwise send this request to a host of their choosing.
    if not path or not path.startswith("/") or path.startswith("//") or "://" in path:
        return {}

    url = source["base_url"] + path
    if not robots_allows(url, config.SCRAPER_USER_AGENT):
        print(f"  timetable: robots.txt disallows {path}")
        return {}

    time.sleep(config.DELAY_SECONDS)
    response = requests.get(
        url,
        headers=_headers(source, "text/html,application/xhtml+xml,*/*"),
        timeout=config.REQUEST_TIMEOUT_SECONDS,
    )
    response.raise_for_status()
    page = response.text
    flight = flight_payload(page)

    found = {}
    for column, key in DETAIL_DATE_KEYS.items():
        value = util.to_date(json_string(flight, key))
        if value:
            found[column] = value

    name, registrar_url = parse_registrar(flight)
    if name:
        found["registrar"] = name
    if registrar_url:
        found["registrar_url"] = registrar_url

    found_company = _company_blob(page, flight)
    if found_company:
        found["details"] = found_company
    return found


def _company_blob(page, flight):
    """What the business is, what it earns, what it claims about itself.

    All of it comes out of the page already downloaded above, so none of it
    costs another request.
    """
    offsets = company.chunk_index(flight)
    blob = {}

    about = company._clean(
        company.resolve(json_string(flight, "about_company"), flight, offsets)
        or company.resolve(json_string(flight, "company_desc"), flight, offsets)
        or ""
    )
    if len(about) > 40:
        blob["about"] = company.trim(about, 2000)

    for key, field in (("sector", "company_sector"), ("promoters", "promoters")):
        value = company._clean(json_string(flight, field) or "")
        if len(value) > 2:
            blob[key] = company.trim(value, 300)

    financials = company.parse_financials(page)
    if financials:
        blob["financials"] = financials

    highlights = company.parse_highlights(page)
    if highlights:
        blob.update(highlights)

    return blob


def fetch(ipo_rows, existing=None):
    """{slug: {column: value}} for IPOs whose timetable is still incomplete.

    Never raises: a timetable is an enrichment, and losing it must not cost us
    the GMP and subscription data the rest of the run collected.
    """
    if config.TIMETABLE_SOURCE in ("none", ""):
        return {}
    source = config.TIMETABLE_SOURCES.get(config.TIMETABLE_SOURCE)
    if not source:
        return {}

    existing = existing or {}
    needed = {}
    for row in ipo_rows:
        existing_row = existing.get(row["slug"])
        missing = _missing_columns(existing_row)
        if missing or _needs_company(existing_row):
            needed[row["slug"]] = missing
    if not needed:
        return {}  # steady state — not a single request

    try:
        listed = _fetch_list(source, ipo_rows)
    except (requests.RequestException, ValueError) as error:
        print(f"  timetable: list fetch failed: {error}")
        return {}

    results = {}

    # Stage 1 — allotment and listing for every IPO, from the one list request.
    for slug, missing in needed.items():
        entry = listed.get(slug)
        if not entry:
            continue
        found = {
            column: entry[column]
            for column in ("allotment_date", "listing_date")
            if column in missing and entry.get(column)
        }
        if found:
            results[slug] = found

    # Stage 2 — detail pages, only for what the list cannot answer.
    budget = config.TIMETABLE_MAX_FETCHES_PER_RUN
    for slug, missing in needed.items():
        if budget <= 0:
            break
        outstanding = missing - set(results.get(slug, {}))
        entry = listed.get(slug)
        wants_company = _needs_company(existing.get(slug))
        if (not outstanding and not wants_company) or not entry:
            continue
        budget -= 1
        try:
            detail = _fetch_detail(source, entry.get("path"))
        except (requests.RequestException, ValueError) as error:
            print(f"  timetable: detail fetch failed for '{slug}': {error}")
            continue
        found = {
            column: value
            for column, value in detail.items()
            if value and (column in outstanding or column == "details")
        }
        if found:
            results.setdefault(slug, {}).update(found)

    incomplete = sum(
        1 for slug, missing in needed.items() if missing - set(results.get(slug, {}))
    )
    if incomplete:
        print(
            f"  timetable: {incomplete} IPOs still incomplete "
            f"(cap {config.TIMETABLE_MAX_FETCHES_PER_RUN} detail fetches/run)"
        )
    return results
