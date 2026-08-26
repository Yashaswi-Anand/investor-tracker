"""
Listing-day price, from NSE's daily bhavcopy archive.

WHY AN ARCHIVE AND NOT A QUOTE
    A live quote could only ever answer on the listing day itself, and the
    scraper is never looking on exactly that day — an IPO drops off NSE's
    lists before it lists, and the archive file for the listing date is not
    published until about 16:30 IST that evening. The bhavcopy is indexed by
    date, so a listing can be read back days or weeks later. Verified: a
    14-day-old listing returned its full OHLC.

WHY THE ISSUE PRICE COMES FROM THE SAME ROW
    On a listing day the row's PrvsClsgPric IS the final issue price
    (verified on 4 of 4 IPOs). That is not a convenience — it is the only
    correct source we have. Our price_band_high is the CAP, and a book-built
    issue may price below it; on DLF the cap gave -4.25% where the truth was
    +0.30%, and the error always runs one way, understating gains and
    manufacturing losses. NSE also reports no price band at all for several
    SME issues, which would make a cap-based percentage divide by nothing.
    Taking both numbers off one exchange row removes both problems.

WHAT THE NUMBER MEANS
    listing_gain_pct = (listing-day OPEN - final issue price) / issue price
    Open, not close: that is what Indian IPO sites publish as "listing gain",
    and it reconciles with theirs. It is the general category's price — a
    retail or employee discount is NOT applied, which is also the published
    convention.
"""

import csv
import decimal
import io
import time
import zipfile

import requests

import config
import util
from sources.gmp import robots_allows

SOURCE_NAME = "listing"

# Columns this module can supply.
COLUMNS = ("listing_price", "listing_gain_pct")

# Bhavcopy column names, in the UDiFF format NSE publishes today.
COL_SYMBOL = "TckrSymb"
COL_OPEN = "OpnPric"
COL_PREV_CLOSE = "PrvsClsgPric"
COL_NAME = "FinInstrmNm"
COL_SERIES = "SctySrs"


def _missing(existing_row):
    """True when this IPO still needs a listing price.

    A locked column is excluded: apply_locks would discard whatever we
    fetched, so spending a request on it is pure waste.
    """
    existing_row = existing_row or {}
    locked = set(existing_row.get("locked") or [])
    if "listing_price" in locked:
        return False
    return not existing_row.get("listing_price")


def is_readable(listing_date, today=None):
    """Whether the archive can possibly hold this date yet.

    The file is published once the trading day is over, so today's listing is
    not readable until this evening. Asking for it earlier just earns a 404,
    and asking for a future date is meaningless. Waiting for the next day
    costs nothing: the archive keeps the row indefinitely.
    """
    if not listing_date:
        return False
    today = today or util.ist_today()
    return str(listing_date) < str(today)


def parse_bhavcopy(payload):
    """{symbol: {open, prev_close, name, series}} from the downloaded ZIP.

    Values that will not parse as numbers are dropped rather than defaulted:
    a 0.0 here would be written to the database and rendered as a -100%
    listing, which is worse than showing nothing.
    """
    with zipfile.ZipFile(io.BytesIO(payload)) as archive:
        names = [n for n in archive.namelist() if n.lower().endswith(".csv")]
        if not names:
            return {}
        text = archive.read(names[0]).decode("utf-8", "replace")

    rows = {}
    for raw in csv.DictReader(io.StringIO(text)):
        # Some NSE CSVs pad their headers and values; strip both or every
        # lookup silently misses.
        row = {(k or "").strip(): (v or "").strip() for k, v in raw.items()}
        symbol = row.get(COL_SYMBOL)
        if not symbol:
            continue
        open_price = util.to_float(row.get(COL_OPEN))
        prev_close = util.to_float(row.get(COL_PREV_CLOSE))
        if open_price is None or not prev_close:
            continue
        rows[symbol.upper()] = {
            "open": open_price,
            "prev_close": prev_close,
            "name": row.get(COL_NAME, ""),
            "series": row.get(COL_SERIES, ""),
        }
    return rows


def gain_percent(listing_price, issue_price):
    """Listing gain as a percentage of the issue price, or None.

    Rounded half AWAY FROM ZERO, not with Python's built-in round(), which
    rounds half to even: a ₹160 issue opening at ₹185 is exactly 15.625%, and
    round() would report 15.62 while half the industry prints 15.63. Neither
    is wrong, but a rule nobody can predict is worse than either.

    Returns None rather than a number whenever an input is missing or the
    issue price is zero. That matters more than it looks: this feeds a
    percentage a reader may act on, and the alternatives are -100% (missing
    price) and Infinity (no issue price), both of which would render as
    confident nonsense.
    """
    if listing_price is None or not issue_price:
        return None
    exact = (decimal.Decimal(str(listing_price)) - decimal.Decimal(str(issue_price))) \
        / decimal.Decimal(str(issue_price)) * 100
    return float(exact.quantize(decimal.Decimal("0.01"), rounding=decimal.ROUND_HALF_UP))


def _fetch_day(source, listing_date):
    """One request: every security that traded on `listing_date`."""
    url = source["url_template"].format(yyyymmdd=str(listing_date).replace("-", ""))
    if not robots_allows(url, config.SCRAPER_USER_AGENT):
        print(f"  listing: robots.txt disallows {url}")
        return {}

    time.sleep(config.DELAY_SECONDS)
    response = requests.get(
        url,
        headers={"User-Agent": config.SCRAPER_USER_AGENT, "Accept": "*/*"},
        timeout=config.REQUEST_TIMEOUT_SECONDS,
    )
    # A 404 is expected and normal: the day's file is published in the
    # evening, and there is none at all for a holiday or a weekend.
    if response.status_code == 404:
        print(f"  listing: no bhavcopy published for {listing_date} yet")
        return {}
    response.raise_for_status()
    return parse_bhavcopy(response.content)


def fetch(ipo_rows, existing=None, today=None):
    """{slug: {listing_price, listing_gain_pct}} for IPOs that have listed.

    Never raises: a missing listing price must not cost the run its GMP and
    subscription data.
    """
    if config.LISTING_SOURCE in ("none", ""):
        return {}
    source = config.LISTING_SOURCES.get(config.LISTING_SOURCE)
    if not source:
        return {}

    existing = existing or {}
    today = today or util.ist_today()

    # Group by date first: one request answers every IPO that listed that day.
    by_date = {}
    for row in ipo_rows:
        existing_row = existing.get(row["slug"])
        if not _missing(existing_row):
            continue
        listing_date = util.to_date(
            row.get("listing_date") or (existing_row or {}).get("listing_date")
        )
        if not is_readable(listing_date, today) or not row.get("symbol"):
            continue
        by_date.setdefault(listing_date, []).append(row)

    if not by_date:
        return {}  # steady state — not a single request

    results = {}
    budget = config.LISTING_MAX_FETCHES_PER_RUN
    # Newest first: a just-listed IPO is what a reader is looking at today.
    for listing_date in sorted(by_date, reverse=True):
        if budget <= 0:
            break
        budget -= 1
        try:
            day = _fetch_day(source, listing_date)
        except (requests.RequestException, ValueError, zipfile.BadZipFile) as error:
            print(f"  listing: {listing_date} fetch failed: {error}")
            continue

        for row in by_date[listing_date]:
            quote = day.get(str(row.get("symbol", "")).upper())
            if not quote:
                print(
                    f"  listing: '{row['slug']}' not in the {listing_date} "
                    f"bhavcopy under symbol '{row.get('symbol')}'"
                )
                continue
            gain = gain_percent(quote["open"], quote["prev_close"])
            if gain is None:
                continue
            results[row["slug"]] = {
                "listing_price": quote["open"],
                "listing_gain_pct": gain,
            }

    outstanding = sum(len(v) for v in by_date.values()) - len(results)
    if outstanding:
        print(
            f"  listing: {outstanding} IPOs still without a price "
            f"(cap {config.LISTING_MAX_FETCHES_PER_RUN} days/run)"
        )
    return results
