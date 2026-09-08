"""
The name a registrar calls an issue, for the registrars we cannot check for
the reader.

WHY THIS EXISTS. Bigshare and MUFG Intime both verify their CAPTCHA on the
server, so the last step of an allotment check stays the reader's: open the
registrar, pick the company, paste the PAN, answer the challenge. The step
that goes wrong is the first one. Their dropdowns carry the issue under the
registrar's own spelling — "DEEPA JEWELLERS LIMITED", "ESDS Software
Solution Limited - IPO" — which is not what our page calls it, and a reader
scanning a list of forty companies for "ESDS Software Solution" has to guess
which entry is theirs.

So we read the list. Both registrars publish it to their own page before any
identifier is involved and before any CAPTCHA exists: Bigshare ships it as
plain <option> tags in a static HTML file, and MUFG returns it from the call
its page makes on load with an empty body. Neither request carries a PAN, an
application number, or anything about a person, and neither touches the
lookup that the CAPTCHA guards.

WHAT IS NEVER DONE HERE. No allotment lookup. No identifier of any kind is
sent. No CAPTCHA is fetched, read or answered. This module exists so the page
can say "pick THIS one" — nothing more.
"""

import json
import re

import requests

import config
from sources.kfin import match as match_name

BIGSHARE_LIST = "https://ipo.bigshareonline.com/IPO_Status.html"
MUFG_LIST = "https://in.mpms.mufg.com/Initial_Offer/IPO.aspx/GetDetails"
MUFG_REFERER = "https://in.mpms.mufg.com/Initial_Offer/public-issues.html"

# <option value="9048">DEEPA JEWELLERS LIMITED</option>. Two digits minimum:
# the same page carries value="0" placeholders on unrelated selects.
_OPTION = re.compile(r'<option\s+value="(\d{2,})"[^>]*>([^<]+)</option>', re.I)
_MUFG_ROW = re.compile(
    r"<company_id>([^<]*)</company_id>\s*<companyname>([^<]*)</companyname>",
    re.S,
)


def _headers(accept):
    return {"User-Agent": config.SCRAPER_USER_AGENT, "Accept": accept}


def parse_bigshare(html):
    """[{client_id, name}] from the static page, placeholders dropped."""
    out = []
    seen = set()
    for value, raw in _OPTION.findall(html or ""):
        name = raw.strip()
        # "Select Selection Type" and friends sit on the same page.
        if not name or name.lower().startswith("select") or value in seen:
            continue
        seen.add(value)
        out.append({"client_id": value, "name": name})
    return out


def parse_mufg(payload):
    """[{client_id, name}] from GetDetails.

    Their response is JSON whose single "d" string is an XML document, so it
    arrives doubly escaped. The board marker is normalised on the way through:
    MUFG writes "Phychem Technologies Limited - SME IPO" where KFin writes
    "... LIMITED SME", and the matcher already knows the second shape.
    """
    if isinstance(payload, (bytes, str)):
        try:
            payload = json.loads(payload)
        except ValueError:
            return []
    document = (payload or {}).get("d") if isinstance(payload, dict) else None
    out = []
    seen = set()
    for company_id, raw in _MUFG_ROW.findall(document or ""):
        company_id = company_id.strip()
        name = raw.strip()
        if not company_id or not name or company_id in seen:
            continue
        seen.add(company_id)
        out.append({"client_id": company_id, "name": name, "label": name})
    return out


def normalise_mufg(name):
    """MUFG's trailing issue-type marker, turned into the one the matcher reads.

    "ESDS Software Solution Limited - IPO"        -> "ESDS Software Solution Limited"
    "Phychem Technologies Limited - SME IPO"      -> "Phychem Technologies Limited SME"
    """
    text = (name or "").strip()
    text = re.sub(r"\s*-\s*SME\s+IPO\s*$", " SME", text, flags=re.I)
    text = re.sub(r"\s*-\s*(FPO|NCD|IPO)\s*$", "", text, flags=re.I)
    return text.strip()


def fetch_bigshare(session=None):
    session = session or requests.Session()
    try:
        response = session.get(
            BIGSHARE_LIST,
            headers=_headers("text/html,*/*"),
            timeout=config.REQUEST_TIMEOUT_SECONDS,
        )
        response.raise_for_status()
    except requests.RequestException as error:
        print(f"      handoff: bigshare list unavailable ({error})")
        return []
    return parse_bigshare(response.text)


def fetch_mufg(session=None):
    """Their own page's on-load call: empty body, no identifier."""
    session = session or requests.Session()
    try:
        response = session.post(
            MUFG_LIST,
            headers={
                **_headers("application/json"),
                "Content-Type": "application/json; charset=utf-8",
                "Referer": MUFG_REFERER,
            },
            data="{}",
            timeout=config.REQUEST_TIMEOUT_SECONDS,
        )
        response.raise_for_status()
    except requests.RequestException as error:
        print(f"      handoff: mufg list unavailable ({error})")
        return []
    return parse_mufg(response.text)


def _is(row, *needles):
    blob = (
        str(row.get("registrar") or "") + " " + str(row.get("registrar_url") or "")
    ).lower()
    return any(n in blob for n in needles)


def fetch(ipo_rows, existing=None):
    """{slug: {"registrar", "name", "id"}} — the registrar's own spelling.

    Never raises: this is a convenience on the hand-off, and a registrar whose
    list cannot be read this run simply leaves the page saying "pick the
    company", which is where it started.
    """
    # Imported here rather than at module scope so the dependency is visible
    # at the one place it is used: resolve() overlays the run's row on the
    # stored one, and every issue this can answer for is a carried skeleton.
    from sources.kfin import resolve

    rows = [resolve(row, existing) for row in ipo_rows]
    bigshare_rows = [r for r in rows if _is(r, "bigshare")]
    mufg_rows = [r for r in rows if _is(r, "mufg", "intime")]
    if not bigshare_rows and not mufg_rows:
        return {}

    session = requests.Session()
    out = {}

    if bigshare_rows:
        entries = fetch_bigshare(session)
        for row in bigshare_rows:
            hit = match_name(row, entries)
            if hit:
                out[row["slug"]] = {
                    "registrar": "bigshare",
                    "name": hit["name"],
                    "id": hit["client_id"],
                }

    if mufg_rows:
        raw = fetch_mufg(session)
        entries = [
            {**e, "name": normalise_mufg(e["name"])} for e in raw
        ]
        labels = {e["client_id"]: e.get("label") or e["name"] for e in raw}
        for row in mufg_rows:
            hit = match_name(row, entries)
            if hit:
                out[row["slug"]] = {
                    "registrar": "mufg",
                    # Their spelling as it appears in the dropdown, not the
                    # normalised one the matcher read.
                    "name": labels.get(hit["client_id"], hit["name"]),
                    "id": hit["client_id"],
                }

    return out
