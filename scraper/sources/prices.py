"""
Daily OHLC for an IPO after it lists, from the same NSE bhavcopy archive that
already supplies the listing price.

WHY THIS SOURCE. A grey market premium stops meaning anything the moment a
share trades on an exchange — there is a real price now, quoted all day. So
after listing the chart should show what the stock did, not what the grey
market guessed it would do, and that needs open/high/low/close per day. The
bhavcopy carries exactly that (OpnPric, HghPric, LwPric, ClsPric, TtlTradgVol)
for every security that traded, so one request covers every listed IPO at once.

WHERE IT IS STORED. In the existing details jsonb, under "prices", rather than
in a table of its own. A new table would need a migration run by hand in
Supabase before anything worked; a bounded list of daily bars — three months
at most, a few kilobytes — sits comfortably in the column that is already
there. NSE never writes a "prices" key, so merge_details cannot collide.

POLITENESS. One request per trading day, and only for days not already
stored. The first run for a newly listed IPO backfills from its listing date;
after that it is one request a day for the whole site, whatever else is
happening.
"""

import csv
import datetime
import io
import time
import zipfile

import requests

import config
import util
from sources.gmp import robots_allows

SOURCE_NAME = "nse_bhavcopy"

COL_DATE = "TradDt"
COL_SYMBOL = "TckrSymb"
COL_SERIES = "SctySrs"
COL_OPEN = "OpnPric"
COL_HIGH = "HghPric"
COL_LOW = "LwPric"
COL_CLOSE = "ClsPric"
COL_VOLUME = "TtlTradgVol"

# Three months of daily bars is enough to read a new listing's story and keeps
# the jsonb small. Older bars fall off the front.
MAX_BARS = 90

# A cap on how far a single run will backfill, so a first run for an old
# listing cannot turn into a hundred requests in one go. It catches up over
# the following runs instead.
MAX_DAYS_PER_RUN = 8

# Only the cash-market equity series. Bhavcopy also carries SME (SM/ST) rows,
# which we want, but not debt, ETFs or anything expiring.
EQUITY_SERIES = {"EQ", "BE", "SM", "ST"}


def _num(value):
    try:
        return float(str(value).strip())
    except (TypeError, ValueError):
        return None


def parse_day(raw_zip):
    """{symbol: bar} for one trading day's bhavcopy."""
    try:
        archive = zipfile.ZipFile(io.BytesIO(raw_zip))
    except zipfile.BadZipFile:
        return {}
    names = archive.namelist()
    if not names:
        return {}

    text = archive.read(names[0]).decode("utf-8", "ignore")
    out = {}
    for row in csv.DictReader(io.StringIO(text)):
        # Header padding: NSE has shipped files with trailing spaces in the
        # column names before, and listing.py already carries the same guard.
        row = {(k or "").strip(): (v or "").strip() for k, v in row.items()}
        if row.get(COL_SERIES) not in EQUITY_SERIES:
            continue
        symbol = row.get(COL_SYMBOL)
        close = _num(row.get(COL_CLOSE))
        if not symbol or close is None:
            continue
        out[symbol] = {
            "d": row.get(COL_DATE),
            "o": _num(row.get(COL_OPEN)),
            "h": _num(row.get(COL_HIGH)),
            "l": _num(row.get(COL_LOW)),
            "c": close,
            "v": int(_num(row.get(COL_VOLUME)) or 0),
        }
    return out


def _fetch_day(source, day):
    """One request: every security that traded on `day`, or {}."""
    url = source["url_template"].format(yyyymmdd=str(day).replace("-", ""))
    if not robots_allows(url, config.SCRAPER_USER_AGENT):
        print(f"  prices: robots.txt disallows {url}")
        return {}

    time.sleep(config.DELAY_SECONDS)
    try:
        response = requests.get(
            url,
            headers={"User-Agent": config.SCRAPER_USER_AGENT, "Accept": "*/*"},
            timeout=config.REQUEST_TIMEOUT_SECONDS,
        )
    except requests.RequestException as error:
        print(f"  prices: {day} failed: {error}")
        return {}

    # A 404 is normal, not a fault: weekends, holidays, and the current day
    # until the file is published in the evening.
    if response.status_code == 404:
        return {}
    if not response.ok:
        return {}
    return parse_day(response.content)


def _wanted_days(rows, existing, today):
    """The trading days worth fetching, newest first.

    Bounded at both ends: never before the earliest listing we are missing
    bars for, never more than MAX_DAYS_PER_RUN in one run, and never today
    itself — the file does not exist until the evening.
    """
    earliest = None
    have = {}
    for row in rows:
        slug = row["slug"]
        stored = (existing.get(slug) or {}).get("details") or {}
        bars = stored.get("prices") or []
        have[slug] = {bar.get("d") for bar in bars if isinstance(bar, dict)}

        listing_date = util.to_date(
            row.get("listing_date") or (existing.get(slug) or {}).get("listing_date")
        )
        if not row.get("symbol") or not listing_date or listing_date >= today:
            continue
        # The first day worth asking for is the day after the newest bar we
        # already hold, or the listing day itself.
        start = max(bars_last(bars) or listing_date, listing_date)
        if earliest is None or start < earliest:
            earliest = start

    if earliest is None:
        return [], have

    days = []
    cursor = datetime.date.fromisoformat(today) - datetime.timedelta(days=1)
    floor = datetime.date.fromisoformat(earliest)
    while cursor >= floor and len(days) < MAX_DAYS_PER_RUN:
        if cursor.weekday() < 5:  # Saturdays and Sundays never have a file.
            days.append(cursor.isoformat())
        cursor -= datetime.timedelta(days=1)
    return days, have


def bars_last(bars):
    """The newest date among stored bars, or None."""
    dates = [b.get("d") for b in bars or [] if isinstance(b, dict) and b.get("d")]
    return max(dates) if dates else None


def fetch(rows, existing=None, today=None):
    """{slug: [bar, ...]} — daily OHLC for every IPO that has listed.

    Never raises: this is a chart, and losing it must not cost the run the
    GMP and subscription data it collected.
    """
    source = config.LISTING_SOURCES.get(config.LISTING_SOURCE)
    if not source:
        return {}

    existing = existing or {}
    today = today or util.ist_today()
    by_symbol = {}
    for row in rows:
        if row.get("symbol"):
            by_symbol.setdefault(row["symbol"], []).append(row["slug"])
    if not by_symbol:
        return {}

    days, have = _wanted_days(rows, existing, today)
    if not days:
        return {}

    # Only ask for a day if at least one IPO is missing it.
    fetched = {}
    for day in days:
        if all(day in have.get(slug, set()) for slugs in by_symbol.values() for slug in slugs):
            continue
        try:
            fetched[day] = _fetch_day(source, day)
        except Exception as error:  # noqa: BLE001 - a chart is never worth a run
            print(f"  prices: {day} skipped: {error}")

    merged = {}
    for symbol, slugs in by_symbol.items():
        for slug in slugs:
            stored = (existing.get(slug) or {}).get("details") or {}
            bars = {
                b["d"]: b
                for b in (stored.get("prices") or [])
                if isinstance(b, dict) and b.get("d")
            }
            added = 0
            for day, day_rows in fetched.items():
                bar = day_rows.get(symbol)
                if bar and bar.get("d"):
                    bars[bar["d"]] = bar
                    added += 1
            if not added:
                continue
            merged[slug] = sorted(bars.values(), key=lambda b: b["d"])[-MAX_BARS:]

    if merged:
        print(f"  prices: {len(fetched)} day(s) read, {len(merged)} IPOs updated")
    return merged
