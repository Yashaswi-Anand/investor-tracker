"""Which issues NSE's own bid verification can still answer for.

WHAT THIS IS FOR. The allotment page offers the exchange as a second place to
look, beside the registrar. That offer is only honest for an issue NSE still
holds: ask about any other and their page answers "This Application is not
Bided / Processed from NSE", which reads like a verdict and is not one. Their
bid-verification page populates its own dropdown from this endpoint before any
challenge exists, so the same list tells us which cards should carry the link.

WHAT IS NEVER DONE HERE. No lookup is performed and nothing identifying is
sent. The per-PAN endpoint beside this one wraps every call in reCAPTCHA v3
and answers with the applicant's beneficiary id, depository id and UPI blocked
amount — see PROJECT_CONTEXT 8.3. This module reads a list of ticker symbols
and nothing else.

WHY SYMBOLS AND NOT NAMES. NSE is where this site's issues come from, so every
row already carries the exchange's own symbol. Matching on it avoids the
spelling problem that makes the registrar hand-off need a name lookup at all —
"Bonfiglioli Transmissions Limited" against "BONFIG" is not a comparison
anyone should be making by hand.
"""

import requests

import config
from . import nse

MASTER = "https://www.nseindia.com/api/ipo-bid-master"


def parse_symbols(payload):
    """The symbol set from whatever shape the endpoint returns.

    Today it is a bare JSON array of strings. It is read defensively because
    the same endpoint on other NSE pages returns {"data": [...]}, and a shape
    change should cost the link on a few cards, not the run.
    """
    rows = payload
    if isinstance(payload, dict):
        rows = payload.get("data") or payload.get("symbols") or []
    if not isinstance(rows, list):
        return set()

    out = set()
    for row in rows:
        if isinstance(row, str):
            value = row
        elif isinstance(row, dict):
            value = row.get("symbol") or row.get("Symbol") or ""
        else:
            continue
        value = value.strip().upper()
        if value:
            out.add(value)
    return out


def fetch_symbols(session=None):
    """The covered symbols, or None if the list cannot be read.

    None and empty mean different things to the caller: None is "we do not
    know", which leaves whatever was decided last run in place, and an empty
    set would be "NSE covers nothing", which should never be written off a
    failed request.
    """
    session = session or nse.make_session()
    try:
        response = session.get(MASTER, timeout=config.REQUEST_TIMEOUT_SECONDS)
        response.raise_for_status()
        payload = response.json()
    except (requests.RequestException, ValueError) as error:
        print(f"      nse-bid: list unavailable ({error})")
        return None

    symbols = parse_symbols(payload)
    if not symbols:
        print("      nse-bid: list read but held no symbols")
        return None
    return symbols


def fetch(ipo_rows, session=None):
    """{slug: True} for the rows NSE's bid verification currently covers.

    Only positives are returned. A slug missing from the result is one we
    either know NSE does not hold or could not ask about, and the caller
    keeps what it had rather than withdrawing a working link on a bad run.
    """
    symbols = fetch_symbols(session)
    if not symbols:
        return {}

    covered = {}
    for row in ipo_rows or []:
        symbol = str((row or {}).get("symbol") or "").strip().upper()
        slug = (row or {}).get("slug")
        if slug and symbol and symbol in symbols:
            covered[slug] = True
    return covered
