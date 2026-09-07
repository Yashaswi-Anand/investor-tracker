"""
NSE source — official exchange data, no API key required.

Supplies everything except GMP:
  name, symbol, board, status, open/close dates, price band, issue size,
  face value, lot size, and QIB / NII / Retail / total subscription.

Three endpoints are used:
  all-upcoming-issues  -> forthcoming IPOs
  ipo-current-issue    -> active IPOs + total subscription
  ipo-detail           -> issueInfo table (lot size, face value, issue size)
  ipo-active-category  -> category-wise subscription
"""

import re
import time

import requests

import config
from util import (
    derive_status,
    min_investment,
    parse_lot_size,
    parse_price_band,
    short_name,
    slugify,
    to_date,
    to_float,
    to_int,
    utc_now,
)

SOURCE_NAME = "nse"


def make_session():
    """NSE requires cookies from the homepage before its API responds."""
    session = requests.Session()
    session.headers.update(config.NSE_HEADERS)
    try:
        session.get(
            config.nse_url("home"), timeout=config.REQUEST_TIMEOUT_SECONDS
        )
    except requests.RequestException:
        pass  # the API often works anyway; individual calls handle failure
    return session


def _get_json(session, url):
    """GET with retries. Returns parsed JSON, or None on failure.

    MAX_RETRIES counts total attempts, and is floored at 1 — a value of 0
    would otherwise skip the request entirely and report failure without
    ever touching the network.
    """
    attempts = max(1, config.MAX_RETRIES)
    for attempt in range(attempts):
        try:
            response = session.get(url, timeout=config.REQUEST_TIMEOUT_SECONDS)
            response.raise_for_status()
            return response.json()
        except (requests.RequestException, ValueError):
            if attempt == attempts - 1:
                return None
            time.sleep(config.DELAY_SECONDS * (attempt + 1))
    return None


def _issue_info_map(detail):
    """issueInfo.dataList is a list of {title, value} rows -> plain dict."""
    info = (detail or {}).get("issueInfo") or {}
    rows = info.get("dataList") or []
    return {
        str(row.get("title")).strip(): str(row.get("value") or "").strip()
        for row in rows
        if row.get("title")
    }


def normalize_list_item(raw):
    """Normalize one row of the upcoming / current issue list."""
    name = raw.get("companyName")
    if not name:
        return None

    open_date = to_date(raw.get("issueStartDate"))
    close_date = to_date(raw.get("issueEndDate"))
    low, high = parse_price_band(raw.get("issuePrice"))
    series = (raw.get("series") or "").upper()

    return {
        "slug": slugify(name),
        "name": name.strip(),
        "short_name": short_name(name),
        "symbol": raw.get("symbol"),
        "board": "SME" if series in ("SME", "ST") else "Mainboard",
        # Dates first, always. NSE reports an issue as "active" past its
        # close date, and trusting that over the timetable is exactly how
        # issues got stuck showing as open days after bidding ended. The flag
        # is kept only for the case where NSE gave us no dates at all.
        "status": derive_status(open_date, close_date, None)
        if (open_date or close_date)
        else ("open" if (raw.get("status") or "").lower() == "active" else "upcoming"),
        "price_band_low": low,
        "price_band_high": high,
        "issue_size_shares": to_int(raw.get("issueSize")),
        # NSE is telling us about its own issues, so NSE is a given; the flag
        # says whether BSE carries it too. It is SPARSE — set on some rows and
        # null on others, including mainboard issues that certainly do list on
        # both — so a missing flag means NSE did not say, never "NSE only".
        "_is_bse": str(raw.get("isBse") or "") in ("1", "true", "True"),
        "open_date": open_date,
        "close_date": close_date,
        "subscription_total": to_float(raw.get("noOfTime")),
        "source": SOURCE_NAME,
        "updated_at": utc_now(),
        "_series": series or "EQ",
    }


# Company and issue detail NSE publishes that has nowhere else to live.
# Matched by the START of the title: NSE writes some of them at essay length
# ("Cut-off time for UPI Mandate Confirmation by Investor..."), and an exact
# match on those would break the first time a word changed.
DETAIL_TITLES = (
    ("issue_type", "Issue Type"),
    ("discount", "Discount"),
    ("tick_size", "Tick Size"),
    ("sponsor_bank", "Sponsor Bank"),
    ("upi_cutoff", "Cut-off time for UPI Mandate"),
    ("categories", "Categories"),
    ("upi_categories", "Sub-Categories applicable for UPI"),
    ("max_retail", "Maximum Subscription Amount for Retail"),
    ("max_employee", "Maximum Subscription Amount for El"),
    ("max_bid_qib", "Maximum Bid Quantity for QIB"),
    ("max_bid_nii", "Maximum Bid Quantity for NIB"),
    ("min_order_qty", "Minimum Order Quantity"),
    ("registrar_address", "Address of the Registrar"),
    ("registrar_contact", "Contact person name"),
    ("market_timings", "IPO Market Timings"),
)

# Titles whose value is a document URL rather than prose.
DETAIL_LINKS = (
    ("rhp_url", "Red Herring Prospectus"),
    ("ratios_url", "Ratios / Basis of Issue Price"),
    ("anchor_url", "Anchor Allocation Report"),
    ("forms_url", "Sample Application Forms"),
    ("bidding_centers_url", "Bidding Centers"),
    # NSE spells this one two ways: "Security Parameters (Pre Anchor)" on
    # mainboard issues and a bare "Security Parameters" on some SME ones.
    ("preanchor_url", "Security Parameters"),
    ("postanchor_url", "Security Parameters (Post Anchor)"),
)

_URL = re.compile(r"https?://\S+")

# "fresh issue aggregating up to Rs. 3,156 million and offer for sale of up
# to 1,33,33,300 Equity Shares" — the one line that says how much of the
# money reaches the company and how much reaches the people selling out.
# Every IPO page shows that split; ours had the sentence and never read it.
# Two ways NSE writes the same thing, and both turn up: an amount with a
# unit ("aggregating up to Rs. 3,156 million") or a share count ("of up to
# 35,52,000 Equity Shares"). A pattern that only understood rupees read the
# first half of Pranav's sentence and nothing of Qualiance's.
_FRESH = re.compile(
    r"fresh\s+issue\b[^.;]{0,80}?"
    r"(?:Rs\.?\s*)?([\d][\d,.]*)\s*"
    r"(million|billion|crore|cr\b|lakh|equity\s+shares?)",
    re.I,
)
_OFS = re.compile(
    r"offer\s+for\s+sale\b[^.;]{0,80}?"
    r"(?:Rs\.?\s*)?([\d][\d,.]*)\s*"
    r"(million|billion|crore|cr\b|lakh|equity\s+shares?)",
    re.I,
)
# NSE writes amounts in millions as often as in crore. One unit out and the
# number is off by a factor of ten, so the conversion is explicit.
_TO_CRORE = {
    "million": 0.1,
    "billion": 100.0,
    "crore": 1.0,
    "cr": 1.0,
    "lakh": 0.01,
}


def _amount(text, unit):
    """('3,156', 'million') -> ('cr', 315.6);  ('35,52,000', 'Equity Shares')
    -> ('shares', 3552000). Returns None when the number is not a size."""
    try:
        value = float(str(text).replace(",", ""))
    except (TypeError, ValueError):
        return None
    if value <= 0:
        return None
    word = re.sub(r"\s+", " ", (unit or "")).strip().lower()
    if word.startswith("equity share"):
        return "shares", int(value)
    factor = _TO_CRORE.get(word.rstrip("."))
    if factor is None:
        return None
    return "cr", round(value * factor, 2)


def parse_issue_split(text):
    """{'fresh_cr': .., 'ofs_cr': ..} from the Issue Size sentence.

    Only the components NSE actually states are returned. A pure OFS issue
    has no fresh component at all, and inventing a zero for it would read as
    "the company raises nothing" rather than "this is entirely a sale by
    existing holders" — which is the same fact but not the same sentence.
    """
    if not text:
        return None
    split = {}
    for name, pattern in (("fresh", _FRESH), ("ofs", _OFS)):
        match = pattern.search(text)
        if not match:
            continue
        parsed = _amount(*match.groups())
        if parsed:
            kind, value = parsed
            split[f"{name}_{kind}"] = value
    return split or None


def parse_company_details(info):
    """The issue detail NSE carries beyond the columns we already store.

    Values NSE writes as 'NA' are dropped rather than stored: a row reading
    "Discount: NA" is noise, and an absent key lets the page leave the line
    out entirely.
    """
    details = {}
    for key, prefix in DETAIL_TITLES:
        title = next((t for t in info if t.startswith(prefix)), None)
        value = (info.get(title) or "").strip('" ').strip() if title else ""
        # NSE writes long values as embedded quoted strings with newlines.
        value = re.sub(r"\s+", " ", value)
        if value and value.upper() not in ("NA", "N/A", "-"):
            details[key] = value[:400]

    for key, prefix in DETAIL_LINKS:
        # Mainboard issues title it "Security Parameters (Pre Anchor)", some
        # SME ones just "Security Parameters" — so the pre-anchor prefix has
        # to be the short one, which would otherwise also match the post
        # document on an issue that only published that.
        candidates = [t for t in info if t.startswith(prefix)]
        if key == "preanchor_url":
            candidates = [t for t in candidates if "post" not in t.lower()]
        title = candidates[0] if candidates else None
        match = _URL.search(info.get(title) or "") if title else None
        if match:
            details[key] = match.group(0).rstrip('">,')

    return details or None


def parse_detail(detail, board=None):
    """Pull lot size / face value / issue size / lead managers out of ipo-detail.

    Mainboard and SME issues label the lot differently:
        Mainboard -> "Bid Lot"
        SME       -> "Lot Size"
    so several titles are tried in order.
    """
    info = _issue_info_map(detail)
    if not info:
        return {}

    low, high = parse_price_band(info.get("Price Range"))

    lot = None
    for title in ("Bid Lot", "Lot Size", "Market Lot", "Minimum Order Quantity"):
        lot = parse_lot_size(info.get(title))
        if lot:
            break

    managers = info.get("Book Running Lead Managers") or info.get(
        "Lead Manager"
    )
    manager_list = None
    if managers:
        parts = [
            part.strip(' "')
            for part in re.split(r"[,;]| and ", managers)
            if part.strip(' "')
        ]
        manager_list = parts[:10] or None

    issue_size = (info.get("Issue Size") or "").strip('" ') or None

    # Everything that belongs in the details blob rather than a column,
    # gathered here so parse_detail stays the one place that reads a
    # ipo-detail response.
    details = parse_company_details(info) or {}
    for key, value in (
        ("issue_split", parse_issue_split(issue_size)),
        ("demand", parse_demand(detail)),
    ):
        if value:
            details[key] = value

    fields = {
        "lot_size": lot,
        "face_value": to_float(info.get("Face Value")),
        "issue_size": issue_size,
        "lead_managers": manager_list,
        "registrar": (info.get("Name of the Registrar") or "").strip('" ') or None,
        "details": details or None,
    }
    if low is not None:
        fields["price_band_low"] = low
    if high is not None:
        fields["price_band_high"] = high
    # Board-dependent: an SME application is two lots, not one. util owns
    # that rule so the pipeline's recompute cannot disagree with this one.
    smallest = min_investment(lot, high, board)
    if smallest is not None:
        fields["min_investment"] = smallest

    return {key: value for key, value in fields.items() if value is not None}


# ---------------------------------------------------------------- bidding ---

# NSE numbers the category rows, and the numbering is the only stable thing
# about them: the labels run to eighty characters and change wording between
# mainboard and SME, but "2.1" has meant big-ticket NII on every issue seen.
# Sub-rows (1(a), 2.1(b) ...) split a category by investor type and are left
# out — they triple the table's height to answer a question nobody asked.
CATEGORY_ROWS = (
    ("1", "qib", "QIB"),
    ("2", "nii", "NII / HNI"),
    ("2.1", "nii_big", "bNII · bids above \u20b910L"),
    ("2.2", "nii_small", "sNII · bids \u20b92L\u2013\u20b910L"),
    ("3", "retail", "Retail"),
    ("4", "employee", "Employee"),
    ("5", "shareholder", "Shareholder"),
)
_BY_SR = {sr: (key, label) for sr, key, label in CATEGORY_ROWS}

# The per-category columns this endpoint owns. Not subscription_total, which
# comes from the issue list and is never this endpoint's to blank.
CATEGORY_COLUMNS = (
    "subscription_qib",
    "subscription_nii",
    "subscription_retail",
    "subscription_emp",
)


def _shares(value):
    """NSE writes share counts as '4643000', '9719000.0' or ''."""
    number = to_float(value)
    return int(number) if number and number > 0 else None


def category_stamp(payload):
    """When ipo-active-category last had anything put in it.

    NSE returns the field as "Updated as on 04-Sep-2026 17:00:00", or as the
    literal string "Updated as on null" for a table it has never filled. The
    difference matters more than it looks: this endpoint lags the rest of
    NSE badly — measured three days behind on a live issue — so its age has
    to travel with its numbers rather than being thrown away.
    """
    raw = str((payload or {}).get("updateTime") or "").strip()
    stamp = re.sub(r"^Updated as on\s*", "", raw).strip()
    if not stamp or stamp.lower() in ("null", "none", "-"):
        return None
    return stamp


def _first(row, *keys):
    """The first key that is actually present. NSE spells the same field
    differently between issues — a mainboard book says noOfsharesBid and an
    SME one says noOfshareBid, one 's' apart — and reading only one spelling
    silently drops every issue that uses the other."""
    for key in keys:
        if row.get(key) not in (None, ""):
            return row[key]
    return None


def _same_day(a, b):
    """Both stamps land on the same date. NSE writes them as
    '07-Sep-2026 12:42:00', so the date is the first token."""
    if not a or not b:
        return False
    return str(a).split()[0].lower() == str(b).split()[0].lower()


def parse_book(detail, categories=None):
    """One row per category: who bid how much, and how many of them there are.

    TWO RESPONSES CARRY THIS, AND THEY MEASURE DIFFERENT BOOKS.

      ipo-active-category  every exchange the issue trades on. Its totals
                           match demandGraphALL. It can also be days stale —
                           on Qualiance it sat frozen at the previous Friday
                           for three days while the issue went from twelve
                           times subscribed to twenty-three.
      bidDetails           NSE alone. Its totals match demandGraph exactly,
                           and it is always current, being part of the same
                           response as the live quote.

    Measured on Pranav, a mainboard issue on both exchanges: bidDetails came
    to 3.88 crore shares and active-category to 5.83 crore, against headline
    figures of 1.73x on NSE and 2.60x across both. Neither is wrong; they
    count different things. So the combined book is preferred when it is
    current, and NSE's own is used when it is not — and `scope` records
    which, because "2.60x across both exchanges" and "1.73x on NSE" are
    different sentences and the page should not print one as the other.

    Applications only ever appear in bidDetails, so they are merged in from
    there whichever source supplied the shares.
    """
    live_rows = (detail or {}).get("bidDetails") or []
    cat_rows = ((categories or {}).get("dataList") or [])

    live_stamp = re.sub(
        r"^As on\s*", "", str(((detail or {}).get("demandGraph") or {}).get("timestamp") or "")
    ).strip()
    cat_stamp = category_stamp(categories)

    # The combined book has to be keeping up AND carrying every category the
    # live one does. On Qualiance it omits retail entirely — not stale, just
    # absent — so choosing it for freshness alone produced a retail row with
    # fifty thousand applications behind it and no shares bid, which is the
    # same "missing means nothing" hole in a new place. A book that cannot
    # show retail is not the better book.
    combined = bool(cat_rows) and _same_day(cat_stamp, live_stamp)

    def indexed(rows, bid_keys, offered_keys):
        out = {}
        for row in rows:
            sr = str(row.get("srNo") or "").strip()
            if sr not in _BY_SR:
                continue
            out[sr] = (
                _shares(_first(row, *bid_keys)),
                _shares(_first(row, *offered_keys)),
            )
        return out

    live = indexed(live_rows, ("noOfsharesBid", "noOfshareBid"), ("noOfSharesOffered",))
    both = indexed(cat_rows, ("noOfSharesBid",), ("noOfShareOffered",))

    # Every category the live book can price, the combined one must price too.
    covered = {sr for sr, (bid, _) in both.items() if bid is not None}
    needed = {sr for sr, (bid, _) in live.items() if bid is not None}
    if combined and not needed <= covered:
        combined = False

    chosen = both if combined else live

    applications = {}
    for row in live_rows:
        sr = str(row.get("srNo") or "").strip()
        count = to_int(row.get("noofapplication"))
        if sr in _BY_SR and count:
            applications[sr] = count

    out = []
    for sr, key, label in CATEGORY_ROWS:
        bid, offered = chosen.get(sr, (None, None))
        # A reservation is fixed when the issue is structured, so either
        # response's copy of it is as good as the other's.
        if offered is None:
            offered = (live.get(sr) or (None, None))[1] or (both.get(sr) or (None, None))[1]
        item = {"key": key, "label": label}
        if bid is not None:
            item["bid"] = bid
        if offered is not None:
            item["offered"] = offered
        if applications.get(sr):
            item["applications"] = applications[sr]
        # NSE's own ratio is never copied: it was computed whenever that
        # endpoint last ran, and on a stale one that is days ago. Divided
        # here from two figures that came out of the same response together.
        if bid is not None and offered:
            item["times"] = round(bid / offered, 2)
        # A count of applications with no shares behind it is not a row.
        if bid is not None or offered is not None:
            out.append(item)

    if not out:
        return None
    book = {
        "rows": out,
        "scope": "all" if combined else "nse",
    }
    stamp = cat_stamp if combined else live_stamp
    if stamp:
        book["at"] = stamp
    return book


def parse_demand(detail):
    """The demand curve: cumulative shares bid for at each price in the band.

    NSE publishes it, no aggregator shows it, and it answers a question the
    subscription figure cannot: whether the book is stacked at the cut-off
    price or spread down the band. Bids at the floor of the band are the
    ones that get nothing if the issue prices at the top.
    """
    graph = (detail or {}).get("demandGraph") or {}
    points = (detail or {}).get("demandDataNSE") or []
    curve = []
    for point in points:
        price = to_float(point.get("price"))
        qty = to_int(str(point.get("cumQty") or "").replace(",", ""))
        if price and qty:
            curve.append({"price": price, "qty": qty})
    if not curve:
        return None
    curve.sort(key=lambda p: p["price"])
    demand = {"curve": curve[:40]}
    total = to_int(graph.get("totalBidRecieved") or graph.get("TOTAL_BIDS"))
    if total:
        demand["total_bids"] = total
    offered = to_int(graph.get("totalIssueSize"))
    if offered:
        demand["offered"] = offered
    times = to_float(graph.get("noOfTimesIssueSubscribed"))
    if times:
        demand["times"] = round(times, 2)
    stamp = (graph.get("timestamp") or "").replace("As on ", "").strip()
    if stamp:
        demand["at"] = stamp
    return demand


def parse_subscription(payload):
    """Category-wise subscription (in times) from ipo-active-category.

    ZERO IS NOT ALWAYS ZERO. NSE publishes this table from the moment an
    issue opens, and on some issues — every SME one seen so far — it leaves
    every ratio at "0.00" for the whole bidding period while filling in the
    share counts beside them. Qualiance sat on the site reading 0.00x in
    every category while NSE's own demand graph, the same response's
    activeCat timestamp, and the issue list all said 12.51x: the list row
    had the right number and this function overwrote it with a zero.

    So a ratio of zero is only believed when nothing has been bid. Once
    shares are in the book, a zero here means NSE has not published the
    ratio, and the honest thing is to write nothing and leave the figure
    that came from the issue list standing.
    """
    # No timestamp means NSE has never written to this table for this
    # issue — Pranav's read "Updated as on null" through its whole first
    # morning while the issue list showed it 0.20x away. Reading ratios out
    # of a table that was never filled is how a zero gets published.
    if not category_stamp(payload):
        return {}

    rows = (payload or {}).get("dataList") or []
    result = {}
    for row in rows:
        category = (row.get("category") or "").lower()
        times = to_float(row.get("noOfTotalMeant"))
        if times is None:
            continue
        if not times and _shares(row.get("noOfSharesBid")):
            continue
        value = round(times, 2)
        if "qualified institutional" in category:
            result["subscription_qib"] = value
        elif category.startswith("non institutional investors") and "(" not in category:
            result["subscription_nii"] = value
        elif "retail" in category:
            result["subscription_retail"] = value
        elif "employee" in category:
            result["subscription_emp"] = value
        elif category == "total":
            result["subscription_total"] = value
    return result


def _add_detail(row, key, value):
    """Add one key to a row's details without dropping what is already there.

    parse_detail builds the blob and the subscription call arrives after it,
    so assigning row["details"] a second time would throw away the lot size
    metadata to save a category table.
    """
    if not value:
        return
    details = row.get("details")
    if not isinstance(details, dict):
        details = {}
        row["details"] = details
    details[key] = value


def fetch():
    """Fetch and normalize every IPO NSE knows about."""
    session = make_session()

    list_failures = []

    def get_list(key):
        """Returns (rows, ok). An unreachable endpoint is NOT an empty list —
        conflating the two makes an outage look like 'no IPOs today'."""
        data = _get_json(session, config.nse_url(key))
        if data is None:
            list_failures.append(key)
            return []
        return data if isinstance(data, list) else []

    # `current` carries live subscription, so it is merged last and wins.
    merged = {}
    for raw in get_list("upcoming") + get_list("current"):
        row = normalize_list_item(raw)
        if not row:
            continue
        if row["slug"] in merged:
            merged[row["slug"]].update(
                {k: v for k, v in row.items() if v is not None}
            )
        else:
            merged[row["slug"]] = row

    rows = list(merged.values())

    # Per-IPO enrichment. Failures here are not fatal — the list data is
    # still worth writing — but they are counted and reported, because a run
    # that silently returns no lot sizes should not look like a healthy run.
    failures = []

    for row in rows:
        symbol = row.pop("_symbol", None) or row.get("symbol")
        series = row.pop("_series", "EQ")
        if not symbol:
            continue

        is_bse = row.pop("_is_bse", False)

        detail = None
        if config.FETCH_DETAILS:
            detail = _get_json(
                session, config.nse_url("detail", symbol=symbol, series=series)
            )
            if detail is None:
                failures.append(f"detail:{symbol}")
            else:
                row.update(parse_detail(detail, row.get("board")))
            time.sleep(config.DELAY_SECONDS)

        categories = None
        if row.get("status") == "open":
            subscription = _get_json(
                session, config.nse_url("active_category", symbol=symbol)
            )
            if subscription is None:
                failures.append(f"subscription:{symbol}")
            else:
                # ipo-current-issue is live; this table lags it and sometimes
                # never fills at all. So it may refine a figure and may not
                # replace one with nothing: a zero here over a real number
                # there is how an issue 0.20x away came to read 0.00x.
                before = row.get("subscription_total")
                parsed = parse_subscription(subscription)
                row.update(parsed)
                if before and not row.get("subscription_total"):
                    row["subscription_total"] = before
                categories = subscription
                # Writing nothing is not enough on its own. The old parser
                # already stored 0.00 in these columns, and silence leaves a
                # stored value alone — so the page would show a real total
                # over a row of fabricated zeros. Say the columns are unknown
                # and let the page print nothing for them.
                unknown = [
                    column
                    for column in CATEGORY_COLUMNS
                    if column not in parsed
                ]
                if unknown:
                    row["_clear"] = unknown
            time.sleep(config.DELAY_SECONDS)

        # Built from the detail response, so it survives a failure of the
        # category endpoint — which is the flakier of the two and carries
        # only the reservation. Gating the book on that call meant a live
        # book already in hand was thrown away whenever it timed out.
        book = parse_book(detail, categories)
        if book:
            _add_detail(row, "category_bids", book)

        # Only claimed when NSE actually set the flag. Writing ["NSE"] on a
        # row whose flag was simply absent would put "Listing At: NSE" under a
        # mainboard issue that lists on both — a wrong fact where the page
        # could just as well carry none.
        if is_bse:
            _add_detail(row, "exchanges", ["NSE", "BSE"])

    failures = list_failures + failures

    if failures:
        print(
            f"  WARNING: {len(failures)} request(s) failed: "
            + ", ".join(failures[:8])
            + (" ..." if len(failures) > 8 else "")
        )

    return rows, failures
