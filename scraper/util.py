"""Small parsing helpers shared by every source. Pure functions, easy to test."""

import datetime
import re

DATE_FORMATS = ("%Y-%m-%d", "%d-%b-%Y", "%d-%m-%Y", "%d/%m/%Y", "%d %b %Y")


def slugify(text):
    """'Gaja Alternative Asset Management Limited' -> 'gaja-alternative-...'"""
    slug = re.sub(r"[^a-z0-9]+", "-", (text or "").lower())
    return slug.strip("-")


def short_name(name):
    """Trim the legal suffix for compact display: 'Acme Industries Limited' -> 'Acme Industries'."""
    if not name:
        return None
    cleaned = re.sub(
        r"\s+(limited|ltd\.?|private|pvt\.?)\s*$", "", name.strip(), flags=re.I
    )
    return cleaned or name.strip()


def to_float(value):
    """Parse messy numerics: 'Rs.402', '₹12,500', '2.5328946E7', '-4', None.

    Finds the first number in the string rather than stripping characters —
    stripping turns 'Rs.402' into '.402' (i.e. 0.402), which is wrong.
    """
    if value is None:
        return None
    if isinstance(value, (int, float)):
        return float(value)
    text = str(value).strip()
    if not text:
        return None
    # NSE returns some counts in scientific notation as a string.
    if re.fullmatch(r"[-+]?\d*\.?\d+[eE][-+]?\d+", text):
        try:
            return float(text)
        except ValueError:
            return None
    match = re.search(r"[-+]?\d[\d,]*(?:\.\d+)?", text)
    if not match:
        return None
    try:
        return float(match.group(0).replace(",", ""))
    except ValueError:
        return None


def to_int(value):
    number = to_float(value)
    return int(number) if number is not None else None


def to_date(value):
    """Parse a date in any of the formats the sources use -> 'YYYY-MM-DD'."""
    if not value:
        return None
    text = str(value).strip()
    # Drop English ordinal suffixes before matching: investorgain publishes
    # listing dates as '1st Sep 2026', and the separator-based pattern below
    # cannot see a date through the 'st'. Without this the value parses to
    # None and the date is silently lost rather than loudly rejected.
    text = re.sub(r"(?<=\d)(?:st|nd|rd|th)\b", "", text, flags=re.IGNORECASE)
    match = re.search(r"\d{1,2}[-/ ][A-Za-z]{3,}[-/ ]\d{4}|\d{4}-\d{2}-\d{2}|\d{1,2}[-/]\d{1,2}[-/]\d{4}", text)
    if match:
        text = match.group(0)
    for fmt in DATE_FORMATS:
        try:
            return datetime.datetime.strptime(text, fmt).date().isoformat()
        except ValueError:
            continue
    return None


def parse_price_band(text):
    """'Rs.152 to Rs.160' / '₹95 - ₹100' -> (152.0, 160.0). Single -> (p, p)."""
    numbers = [to_float(n) for n in re.findall(r"[\d,]+(?:\.\d+)?", str(text or ""))]
    numbers = [n for n in numbers if n is not None]
    if len(numbers) >= 2:
        return min(numbers[0], numbers[1]), max(numbers[0], numbers[1])
    if len(numbers) == 1:
        return numbers[0], numbers[0]
    return None, None


def parse_lot_size(text):
    """'93 Equity Shares and in multiples thereof' -> 93"""
    match = re.search(r"([\d,]+)", str(text or ""))
    return to_int(match.group(1)) if match else None


# Bidding ends at 5pm IST on the final day and the UPI mandate cut-off is
# 5pm too, so by 6pm nobody can still apply. Before that hour the issue is
# genuinely still open on its closing date.
CLOSE_HOUR_IST = 18


def derive_status(
    open_date,
    close_date,
    listing_date,
    allotment_date=None,
    today=None,
    hour=None,
):
    """upcoming -> open -> closed -> allotment -> listed, from the timetable.

    Read top down: the furthest milestone a date says we have reached wins.
    That ordering is what makes this safe to run on EVERY row of EVERY run,
    which is the point — the previous version only ever promoted to 'listed',
    so an issue that NSE stopped returning kept whatever status it had when it
    fell off the list. Four issues were sitting on the site as 'open' with
    closing dates one to five days in the past.

    Dates decide, not the source's own flag. NSE keeps an issue marked
    'active' past its close date, and believing that over the timetable is how
    those four got stuck.
    """
    now = datetime.datetime.now(IST)
    today = today or now.date().isoformat()
    hour = now.hour if hour is None else hour

    if listing_date and today >= listing_date:
        return "listed"
    if allotment_date and today >= allotment_date:
        return "allotment"
    if close_date:
        if today > close_date:
            return "closed"
        if today == close_date and hour >= CLOSE_HOUR_IST:
            return "closed"
    if open_date and today >= open_date:
        return "open"
    return "upcoming"


def utc_now():
    return datetime.datetime.now(datetime.timezone.utc).isoformat()


# The scraper runs on GitHub's servers in UTC, but every date it reasons about
# — listing days, trading days — is an Indian calendar date. Between 00:00 and
# 05:30 IST the two disagree, so anything comparing "has this date passed" has
# to ask in IST or it is wrong for five and a half hours a day.
IST = datetime.timezone(datetime.timedelta(hours=5, minutes=30))


def ist_today():
    """Today's calendar date in India, as 'YYYY-MM-DD'."""
    return datetime.datetime.now(IST).date().isoformat()
