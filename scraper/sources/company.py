"""
Company-level detail: what the business is, its financials, its strengths.

PURE PARSING — no requests. Everything here reads the per-IPO page that
sources/timetable.py has already downloaded for the timetable and registrar,
so none of this costs an extra request.

NSE carries none of it. Its ipo-detail payload is entirely issue mechanics —
price band, lot, bank, cut-off times — and never says what the company does,
what it earns, or who runs it. That is why this is the fallback the brief
asked for: NSE first for everything it has, this only for what it does not.
"""

import html as html_module
import re

# The page is a Next.js app. Long strings are not inlined — a field holds a
# reference like "$26" and the text lives in a separate flight chunk keyed by
# that id. Reading the field alone stores the literal "$26", which is exactly
# what happened before this existed.
_REF = re.compile(r"^\$([0-9a-f]+)$")
_TEXT_CHUNK = re.compile(r"^T[0-9a-f]+,")
_TAGS = re.compile(r"<[^>]+>")


def _clean(text):
    """HTML fragment -> readable plain text."""
    text = _TAGS.sub(" ", text or "")
    text = html_module.unescape(html_module.unescape(text))
    return re.sub(r"\s+", " ", text).replace(" ", " ").strip()


# A record starts at the beginning of the stream or just after a newline.
_RECORD = re.compile(r"(?:^|\n)([0-9a-f]{1,4}):")


def chunk_index(flight):
    """{id: offset} — where each record's payload begins in the stream.

    Offsets rather than slices, because a text record declares its own length
    and that length is the only reliable end marker. A record is written
    `27:T7bf,` and the 0x7bf characters that follow contain newlines and
    arrive across several push() calls, so neither "to end of line" nor "to
    the next record header" finds the right end: the first truncates at the
    opening tag, the second swallows everything after it.
    """
    return {m.group(1): m.end() for m in _RECORD.finditer(flight)}


def resolve(value, flight, offsets):
    """Follow a "$26"-style reference to the text it stands for.

    Returns None when the reference cannot be resolved — some are loaded
    lazily by the browser and are genuinely absent from the server response.
    Storing the unresolved "$26" would print it on the page as though it were
    the company description, which is exactly what happened before this
    existed.
    """
    if not value:
        return None
    match = _REF.match(str(value).strip())
    if not match:
        return str(value)

    start = offsets.get(match.group(1))
    if start is None:
        return None

    header = _TEXT_CHUNK.match(flight[start:start + 12])
    if not header:
        # Not a text record; take the line and let the caller clean it.
        end = flight.find("\n", start)
        return flight[start: end if end > 0 else len(flight)]

    body = start + header.end()
    # The declared length is in UTF-8 bytes, so measure in bytes and decode
    # back — counting characters overshoots on any page with a rupee sign.
    length = int(header.group(0)[1:-1], 16)
    raw = flight[body:].encode("utf-8", "surrogatepass")[:length]
    return raw.decode("utf-8", "ignore")


def trim(text, limit=2000):
    """Shorten to `limit`, ending on a sentence if one is close enough.

    A hard slice ends mid-word — "including DIN-me" — which reads as a bug
    rather than an excerpt. Prefer the last full stop, fall back to the last
    space, and only cut mid-word if the text has neither.
    """
    text = (text or "").strip()
    if len(text) <= limit:
        return text

    window = text[:limit]
    # Only accept a sentence break in the last quarter; an early one would
    # throw away most of the description to save a few characters.
    stop = max(window.rfind(". "), window.rfind("? "), window.rfind("! "))
    if stop >= limit * 0.75:
        return window[: stop + 1]

    space = window.rfind(" ")
    return (window[:space] if space > 0 else window).rstrip(" ,;:-") + "…"


def unescape_page(raw_html):
    """Undo the \\u003c-style escaping the page uses for embedded markup."""
    return (
        raw_html.replace("\\u003c", "<")
        .replace("\\u003e", ">")
        .replace("\\u0026", "&")
        .replace("\\u0027", "'")
        .replace('\\"', '"')
    )


# Row label on the page -> the key we store it under. Their wording is kept
# out of our schema deliberately: "Total Income" is what a reader recognises
# as revenue, and "NET Worth" is inconsistently capitalised at the source.
FINANCIAL_ROWS = {
    "total income": "revenue",
    "profit after tax": "profit",
    "assets": "assets",
    "ebitda": "ebitda",
    "net worth": "net_worth",
    "total borrowing": "borrowing",
}


def parse_financials(raw_html):
    """Year-wise financials: {"periods": [...], "rows": {key: [...]}} or None.

    The figures are in ₹ crore, newest period first, exactly as published.
    A period with no value for a row gets None rather than a zero — a missing
    figure and a genuine zero are different facts and a chart must not
    conflate them.
    """
    page = unescape_page(raw_html)
    anchor = page.find("Period Ended")
    if anchor < 0:
        return None

    start = page.rfind("<table", 0, anchor)
    end = page.find("</table>", anchor)
    if start < 0 or end < 0:
        return None
    table = page[start:end]

    rows = []
    for chunk in re.split(r"</tr>", table, flags=re.I):
        cells = [_clean(c) for c in re.findall(r"<t[dh][^>]*>(.*?)(?=<t[dh]|$)", chunk, re.I | re.S)]
        cells = [c for c in cells if c]
        if cells:
            rows.append(cells)

    periods, values = [], {}
    for cells in rows:
        label = cells[0].lower().strip(": ")
        if label.startswith("period"):
            periods = cells[1:]
            continue
        key = FINANCIAL_ROWS.get(label)
        if not key:
            continue
        values[key] = [_number(c) for c in cells[1:]]

    if not periods or not values:
        return None
    # Trim every series to the number of periods actually named, so a stray
    # footer cell can never shift a figure onto the wrong year.
    return {
        "periods": periods,
        "rows": {k: v[: len(periods)] for k, v in values.items()},
        "unit": "cr",
    }


def _number(text):
    cleaned = re.sub(r"[^\d.\-]", "", text or "")
    try:
        return float(cleaned)
    except ValueError:
        return None


# The source spells it "Competitve" on some pages, so match the stem only.
_STRENGTH_HEAD = re.compile(r"Competit\w*\s+Strength", re.I)
_RISK_HEAD = re.compile(r"(?:Risk Factors?|Weakness(?:es)?|Key Risks?)\b", re.I)


_LIST_ITEM = re.compile(r"<li[^>]*>(.*?)</li>", re.I | re.S)


def _bullets(markup, limit=8):
    """The <li> items in a list.

    Parsed as a list rather than split on whitespace: the source publishes
    these as a real <ul>, and collapsing the markup to text first destroys the
    only boundary there is between one point and the next.
    """
    out = []
    for match in _LIST_ITEM.finditer(markup):
        item = _clean(match.group(1))
        if 8 <= len(item) <= 240:
            out.append(item)
        if len(out) >= limit:
            break
    return out


def parse_highlights(raw_html):
    """{"strengths": [...], "risks": [...]} - either list may be absent.

    These are the ISSUER's claims about itself, republished verbatim. They are
    not our assessment, and the page that shows them says so.
    """
    page = unescape_page(raw_html)
    found = {}
    for key, pattern in (("strengths", _STRENGTH_HEAD), ("risks", _RISK_HEAD)):
        match = pattern.search(page)
        if not match:
            continue
        # Bounded to the first list after the heading, so a heading with no
        # list of its own cannot borrow the next section's bullets.
        window = page[match.end(): match.end() + 2000]
        end = window.find("</ul>")
        items = _bullets(window[: end + 5] if end > 0 else window)
        if items:
            found[key] = items
    return found or None
