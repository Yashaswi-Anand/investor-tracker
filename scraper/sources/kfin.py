"""
KFin Technologies — the ids their allotment lookup needs, read from their own
page.

WHY THIS EXISTS. KFin's allotment portal (ipostatus.kfintech.com) is a React
app with no CAPTCHA, whose lookup is a plain GET to an API that answers any
origin — Access-Control-Allow-Origin: * on the preflight, with the two headers
it needs (reqparam, client_id) whitelisted. That means a reader's browser can
ask KFin directly from our page, the same request their own page makes, and
the PAN never passes through us. The one thing the browser cannot get for
itself is the id KFin gives each issue: the list is a JSON literal baked into
a hash-named JS bundle on a host that sends no CORS header for static files,
so it has to be read here, server-side, where no PAN is anywhere near it.

WHAT IS READ. Two public static files: the portal's index.html, to find the
current bundle name, and the bundle, to extract two things —

  [{"clientId":"60121009540","name":"RAYS OF BELIEF LIMITED"}, ...]  (~70)
  "https://<id>.execute-api.ap-south-1.amazonaws.com/prod/api/query?type="

The endpoint is stored alongside the id rather than hard-coded in the web
app, so a KFin deploy that moves the API is picked up on the next run rather
than breaking the page until someone notices.

WHAT IS NEVER DONE HERE. No lookup is performed. Nothing identifying is sent.
The API is not called at all — only the two files any visitor's browser
downloads on arrival. robots.txt is honoured (it is currently open).
"""

import re

import requests

import config
from sources.gmp import robots_allows

PORTAL = "https://ipostatus.kfintech.com/"

_BUNDLE = re.compile(r"static/js/main\.[0-9a-f]+\.js")
_ISSUE = re.compile(r'\{"clientId":"(\d+)","name":"((?:[^"\\]|\\.)*)"\}')
_ENDPOINT = re.compile(
    r"https://[a-z0-9]+\.execute-api\.[a-z0-9-]+\.amazonaws\.com/[A-Za-z0-9/_?=.-]*query\?type="
)

# Corporate suffixes carry no identity. "SME" is kept: on KFin's list it is
# the only thing separating an SME issue from a mainboard one of the same
# company, and it is handled explicitly by match().
_SUFFIX = {"LIMITED", "LTD", "PRIVATE", "PVT", "LLP", "INC", "CO", "COMPANY"}


def _headers():
    return {
        "User-Agent": config.SCRAPER_USER_AGENT,
        "Accept": "text/html,application/javascript,*/*",
    }


def parse_bundle_name(index_html):
    """The hash-named bundle the portal loads, or None."""
    match = _BUNDLE.search(index_html or "")
    return match.group(0) if match else None


def parse_directory(bundle_js):
    """{"endpoint": str|None, "issues": [{"client_id", "name"}]} from the JS.

    Read by scanning for the pairs rather than by locating the JSON.parse()
    call that wraps them: how the literal is embedded is the bundler's
    business and changes with its version, but the shape of each entry is
    KFin's own data and has stayed put.
    """
    text = bundle_js or ""
    issues = []
    seen = set()
    for client_id, raw_name in _ISSUE.findall(text):
        name = raw_name.replace('\\"', '"').replace("\\'", "'").strip()
        if not name or client_id in seen:
            continue
        seen.add(client_id)
        issues.append({"client_id": client_id, "name": name})

    endpoint = None
    found = _ENDPOINT.search(text)
    if found:
        endpoint = found.group(0)

    return {"endpoint": endpoint, "issues": issues}


def fetch_directory(session=None):
    """The current directory, or None if either file cannot be read.

    Two requests per run, however many issues we hold — the list answers for
    all of them at once.
    """
    session = session or requests.Session()
    if not robots_allows(PORTAL, config.SCRAPER_USER_AGENT):
        print("      kfin: robots.txt disallows the portal")
        return None
    try:
        index = session.get(
            PORTAL, headers=_headers(), timeout=config.REQUEST_TIMEOUT_SECONDS
        )
        index.raise_for_status()
        bundle = parse_bundle_name(index.text)
        if not bundle:
            print("      kfin: no bundle reference on the portal page")
            return None
        js = session.get(
            PORTAL + bundle,
            headers=_headers(),
            timeout=config.REQUEST_TIMEOUT_SECONDS,
        )
        js.raise_for_status()
    except requests.RequestException as error:
        print(f"      kfin: {error}")
        return None

    directory = parse_directory(js.text)
    directory["bundle"] = bundle
    if not directory["issues"] or not directory["endpoint"]:
        print(
            f"      kfin: bundle {bundle} had "
            f"{len(directory['issues'])} issues and "
            f"{'an' if directory['endpoint'] else 'no'} endpoint"
        )
        return None
    return directory


def tokens(name):
    """A company name as the words that identify it.

    Upper-cased, punctuation dropped, corporate suffixes removed wherever they
    fall — NSE writes "Rays of Belief Limited- For Profit Social Enterprise
    (FPSE)" with the suffix in the middle, so anchoring at the end would keep
    it. Parentheticals stay: "(INDIA)" is part of Tempsens' name on both
    sides.
    """
    upper = (name or "").upper().replace("&", " AND ")
    words = re.findall(r"[A-Z0-9]+", upper)
    return [w for w in words if w not in _SUFFIX]


def is_kfin(row):
    """Whether the row's registrar is KFin, from either field NSE fills."""
    url = str(row.get("registrar_url") or "").lower()
    name = str(row.get("registrar") or "").lower()
    return "kfintech.com" in url or "kfin" in name or "karvy" in name


def match(row, issues):
    """KFin's entry for this issue, or None when there is not exactly one.

    The rule: after normalising, one name must be a prefix of the other, and
    the shorter must still be at least two words. Prefix rather than equality
    because NSE's name for Rays of Belief carries a seven-word descriptor that
    KFin's does not; two words minimum so that "ACME" alone cannot claim
    "ACME INDUSTRIES".

    KFin lists an SME issue and a mainboard issue of the same company as two
    entries, the SME one with " SME" on the end. When both match, the row's
    board picks; when the board cannot pick, nothing is returned. A wrong id
    would make a reader's lookup answer for the wrong issue, and "not found"
    is the better failure.
    """
    ours = tokens(row.get("name"))
    if len(ours) < 2:
        ours = tokens(row.get("short_name"))
    if len(ours) < 2:
        return None

    board = str(row.get("board") or "").strip().lower()
    candidates = []
    for issue in issues:
        theirs = tokens(issue["name"])
        sme = bool(theirs) and theirs[-1] == "SME"
        core = theirs[:-1] if sme else theirs
        if len(core) < 2:
            continue
        shorter, longer = (core, ours) if len(core) <= len(ours) else (ours, core)
        if longer[: len(shorter)] != shorter:
            continue
        candidates.append((issue, sme, len(core) == len(ours)))

    if not candidates:
        return None
    if len(candidates) == 1:
        return candidates[0][0]

    # Exact-length matches beat prefix matches, so "ACME POWER" does not
    # also claim "ACME POWER SYSTEMS".
    exact = [c for c in candidates if c[2]]
    if exact:
        candidates = exact
    if len(candidates) == 1:
        return candidates[0][0]

    if board == "sme":
        picked = [c for c in candidates if c[1]]
    elif board:
        picked = [c for c in candidates if not c[1]]
    else:
        picked = []
    return picked[0][0] if len(picked) == 1 else None


def fetch(ipo_rows, existing=None):
    """{slug: lookup record} for every KFin issue KFin's directory knows.

    The record is what the allotment page needs and nothing more:

      {"registrar": "kfin", "client_id": "…", "name": "<KFin's spelling>",
       "endpoint": "https://…/query?type=", "at": "<row's updated_at>"}

    Never raises: a directory that cannot be read this run leaves whatever
    was stored last time in place, since an id does not change once issued.
    """
    ours = [row for row in ipo_rows if is_kfin(row)]
    if not ours:
        return {}

    directory = fetch_directory()
    if not directory:
        return {}

    out = {}
    for row in ours:
        hit = match(row, directory["issues"])
        if not hit:
            continue
        out[row["slug"]] = {
            "registrar": "kfin",
            "client_id": hit["client_id"],
            "name": hit["name"],
            "endpoint": directory["endpoint"],
            "at": row.get("updated_at"),
        }
    return out
