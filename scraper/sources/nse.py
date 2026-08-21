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
        "status": "open"
        if (raw.get("status") or "").lower() == "active"
        else derive_status(open_date, close_date, None),
        "price_band_low": low,
        "price_band_high": high,
        "issue_size_shares": to_int(raw.get("issueSize")),
        "open_date": open_date,
        "close_date": close_date,
        "subscription_total": to_float(raw.get("noOfTime")),
        "source": SOURCE_NAME,
        "updated_at": utc_now(),
        "_series": series or "EQ",
    }


def parse_detail(detail):
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

    fields = {
        "lot_size": lot,
        "face_value": to_float(info.get("Face Value")),
        "issue_size": (info.get("Issue Size") or "").strip('" ') or None,
        "lead_managers": manager_list,
    }
    if low is not None:
        fields["price_band_low"] = low
    if high is not None:
        fields["price_band_high"] = high
    if lot and high:
        fields["min_investment"] = round(lot * high)

    return {key: value for key, value in fields.items() if value is not None}


def parse_subscription(payload):
    """Category-wise subscription (in times) from ipo-active-category."""
    rows = (payload or {}).get("dataList") or []
    result = {}
    for row in rows:
        category = (row.get("category") or "").lower()
        times = to_float(row.get("noOfTotalMeant"))
        if times is None:
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

        if config.FETCH_DETAILS:
            detail = _get_json(
                session, config.nse_url("detail", symbol=symbol, series=series)
            )
            if detail is None:
                failures.append(f"detail:{symbol}")
            else:
                row.update(parse_detail(detail))
            time.sleep(config.DELAY_SECONDS)

        if row.get("status") == "open":
            subscription = _get_json(
                session, config.nse_url("active_category", symbol=symbol)
            )
            if subscription is None:
                failures.append(f"subscription:{symbol}")
            else:
                row.update(parse_subscription(subscription))
            time.sleep(config.DELAY_SECONDS)

    failures = list_failures + failures

    if failures:
        print(
            f"  WARNING: {len(failures)} request(s) failed: "
            + ", ".join(failures[:8])
            + (" ..." if len(failures) > 8 else "")
        )

    return rows, failures
