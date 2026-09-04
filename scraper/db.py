"""
Supabase writer.

Two guarantees this module makes, so automation can never destroy the data
you curate by hand:

  1. The `manual` jsonb column is never included in any payload.
  2. Column names listed in a row's `locked` array are stripped from the
     payload before the upsert, so those values survive every run.
"""

import re

import requests

import config
import util

# Never sent to the database by the scraper, under any circumstance.
PROTECTED_COLUMNS = {"manual", "locked", "created_at"}

# Columns calculated from other columns. Locking a source column must also
# hold back everything derived from it, or the stored row contradicts itself:
# a hand-pinned GMP of 77 sitting next to an estimated listing price computed
# from the scraped GMP of 50 is worse than either value alone.
DERIVED_FROM = {
    "gmp": ("estimated_listing", "gmp_updated_at"),
    "lot_size": ("min_investment",),
    "price_band_high": ("min_investment", "estimated_listing"),
    "price_band_low": (),
}


# Columns that identify the row. Locking one of these would strip the primary
# key (or a NOT NULL column) from the payload and fail the ENTIRE batch,
# taking every unrelated IPO down with it.
UNLOCKABLE_COLUMNS = {"slug", "name"}

# Every column the scraper may write. Used to catch typos in `locked` — an
# unrecognised name would otherwise silently protect nothing.
KNOWN_COLUMNS = {
    "slug", "name", "short_name", "board", "status", "symbol",
    "price_band_low", "price_band_high", "lot_size", "min_investment",
    "issue_size", "issue_size_shares", "face_value",
    "gmp", "gmp_updated_at", "estimated_listing",
    "open_date", "close_date", "allotment_date", "refund_date",
    "demat_date", "listing_date",
    "registrar", "registrar_url", "lead_managers",
    "subscription_qib", "subscription_nii", "subscription_retail",
    "subscription_emp", "subscription_total",
    "listing_price", "listing_gain_pct",
    "details",
    "source", "updated_at",
}

_warned_locks = set()


def expand_locks(locked, slug=None):
    """A locked column plus every column derived from it.

    Unknown names are reported once each — a typo like 'GMP' or ' gmp' would
    otherwise look like protection while protecting nothing. Identity columns
    are refused outright because locking them breaks the whole write.
    """
    requested = set(locked or [])

    unknown = requested - KNOWN_COLUMNS
    for name in sorted(unknown):
        key = (slug, name)
        if key not in _warned_locks:
            _warned_locks.add(key)
            print(
                f"  WARNING: locked column '{name}'"
                f"{f' on {slug}' if slug else ''} is not a known column — "
                "it protects nothing. Check spelling/case."
            )

    refused = requested & UNLOCKABLE_COLUMNS
    for name in sorted(refused):
        key = (slug, name)
        if key not in _warned_locks:
            _warned_locks.add(key)
            print(
                f"  WARNING: '{name}' cannot be locked (it identifies the "
                "row); ignoring that lock."
            )

    expanded = (requested & KNOWN_COLUMNS) - UNLOCKABLE_COLUMNS
    for column in tuple(expanded):
        expanded.update(DERIVED_FROM.get(column, ()))
    return expanded


def _headers(extra=None):
    headers = {
        "apikey": config.SUPABASE_SERVICE_KEY,
        "Authorization": f"Bearer {config.SUPABASE_SERVICE_KEY}",
        "Content-Type": "application/json",
    }
    if extra:
        headers.update(extra)
    return headers


def _in_list(values):
    """PostgREST in.(...) list with quoting."""
    return ",".join(f'"{v}"' for v in values)


# Read back on every run so the scraper knows which IPOs still need their
# timetable fetched. Without this the timetable source would have to request a
# detail page for every IPO on every run — 30x the request volume, aimed at a
# site that owes us nothing.
TIMETABLE_COLUMNS = (
    "allotment_date", "refund_date", "demat_date", "listing_date",
    "registrar", "registrar_url",
)

# Read back for the same reason: once a listing price is stored, the source
# is never asked for it again.
LISTING_COLUMNS = ("listing_price", "listing_gain_pct")

# `details` comes back so the scraper can MERGE into it rather than
# replacing it: each source fills different keys, and a source being down
# must not erase what another one found last week.
_EXISTING_COLUMNS = (
    ("slug", "locked", "gmp", "details") + TIMETABLE_COLUMNS + LISTING_COLUMNS
)


def fetch_existing(slugs):
    """Stored state the scraper needs before it can decide what to write.

    listing_date is included because NSE's list endpoints never return it —
    without the stored value an IPO could never progress to 'listed'. The rest
    of the timetable is included so a source that has already answered for an
    IPO is never asked again.
    """
    if not slugs:
        return {}
    select = ",".join(_EXISTING_COLUMNS)
    response = requests.get(
        config.supabase_url("ipos")
        + f"?select={select}&slug=in.({_in_list(slugs)})",
        headers=_headers(),
        timeout=config.REQUEST_TIMEOUT_SECONDS,
    )
    response.raise_for_status()
    return {
        row["slug"]: {
            "locked": row.get("locked") or [],
            "gmp": row.get("gmp"),
            "details": row.get("details") or {},
            **{
                column: row.get(column)
                for column in TIMETABLE_COLUMNS + LISTING_COLUMNS
            },
        }
        for row in response.json()
    }


# How long after listing a row keeps being carried so its daily price bars
# can accumulate. Set to match sources/prices.MAX_BARS — carrying a row
# beyond the window the chart displays would be work with nowhere to go.
PRICE_WINDOW_DAYS = 90


def fetch_unfinished(known_slugs, limit=200):
    """IPOs that still have something outstanding and that NSE has stopped
    returning.

    NSE's list endpoints carry only current and upcoming issues, so an IPO
    drops off them within a day or two of closing — usually BEFORE it lists.
    Every stage of a run works from the rows NSE just handed us, so without
    this those IPOs are never touched again: their timetable can never be
    filled in, and because apply_listing_status only sees rows in the current
    batch, they can never reach 'listed' no matter what listing_date says.

    'listed' rows are included for two different reasons, and both matter.

    First, while listing_price is still missing. That is not tidiness — it is
    the whole reason a listing price can ever be captured. The moment an IPO
    flips to 'listed' it is gone from NSE's lists as well, so if this query
    stopped at 'closed' the one run that noticed the listing would be the
    last run ever to see the row. And that run cannot have the price: NSE
    publishes the day's bhavcopy in the evening, after the flip has already
    happened.

    Second, while the price chart is still filling. That reason was missing,
    and the chart was the casualty: a row stopped matching the moment its
    listing price landed, which is the SAME run that collected its first
    daily bar. Every listed IPO therefore held exactly one bar — the listing
    day — for ever, and a candle chart of one candle is not a chart. Rows
    stay for PRICE_WINDOW_DAYS after listing so the bars can accumulate, then
    drop out and cost nothing again.

    Returns skeleton rows — slug, name, stored status, symbol and the
    timetable. Everything else is left out on purpose: apply_locks drops empty
    values, so a skeleton can only ever add to a stored row, never blank part
    of it, and writing a date back over itself is a no-op.

    The dates are not decoration. Status is derived from them on every run,
    and a carried row without them could only ever keep the status it had when
    NSE stopped returning it.
    """
    # Matches sources/prices.MAX_BARS: no point carrying a row longer than
    # the chart will keep the bars it produces.
    since = util.days_ago(PRICE_WINDOW_DAYS)
    unfinished = (
        "or=("
        "status.in.(upcoming,open,closed),"
        "and(status.eq.listed,listing_price.is.null),"
        f"and(status.eq.listed,listing_date.gte.{since})"
        ")"
    )
    response = requests.get(
        config.supabase_url("ipos")
        + "?select=slug,name,status,symbol,open_date,close_date,"
        + f"allotment_date,listing_date&{unfinished}&limit={limit}",
        headers=_headers(),
        timeout=config.REQUEST_TIMEOUT_SECONDS,
    )
    response.raise_for_status()
    known = set(known_slugs or ())
    return [
        {
            "slug": row["slug"],
            "name": row.get("name"),
            "status": row.get("status"),
            "symbol": row.get("symbol"),
            "open_date": row.get("open_date"),
            "close_date": row.get("close_date"),
            "allotment_date": row.get("allotment_date"),
            "listing_date": row.get("listing_date"),
            "updated_at": util.utc_now(),
        }
        for row in response.json()
        if row.get("slug") not in known
    ]


def apply_locks(rows, existing):
    """Strip protected, locked, and locked-derived columns from each row."""
    cleaned = []
    for row in rows:
        slug = row["slug"]
        locked = expand_locks(existing.get(slug, {}).get("locked"), slug)
        payload = {
            key: value
            for key, value in row.items()
            if key not in PROTECTED_COLUMNS
            and key not in locked
            and not key.startswith("_")
        }
        # An empty value must never blank out a column that already has data.
        # Empty strings and empty lists count as empty too: a source that
        # returns "" for a registrar it does not know would otherwise erase a
        # registrar we already had.
        payload = {
            key: value
            for key, value in payload.items()
            if key in ("slug", "name") or not _is_empty(value)
        }
        cleaned.append(payload)
    return cleaned


def _is_empty(value):
    if value is None:
        return True
    if isinstance(value, str):
        return value.strip() == ""
    if isinstance(value, (list, tuple, dict, set)):
        return len(value) == 0
    return False


def group_by_shape(rows):
    """Group rows that share an identical set of column names.

    PostgREST rejects a bulk insert whose objects have different keys
    (PGRST102: "All object keys must match"). Our rows legitimately differ —
    empty columns are dropped so they cannot blank existing data, and locked
    columns are stripped per row — so we send one request per distinct shape
    instead of padding rows back out with nulls.
    """
    groups = {}
    for row in rows:
        signature = tuple(sorted(row.keys()))
        groups.setdefault(signature, []).append(row)
    return list(groups.values())


_MISSING_COLUMN = re.compile(r"'([a-z_]+)' column|column ['\"]?([a-z_]+)['\"]? of")


def _column_not_in_database(response, sent_columns):
    """The column name PostgREST just rejected, if that is what went wrong.

    A brand-new column is written by the scraper before the migration that
    creates it has necessarily been applied. Without this the whole batch
    fails and the run loses its GMP, subscription and timetable data too —
    one unmigrated column would take everything down with it.
    """
    if response.status_code not in (400, 404):
        return None
    body = (response.text or "").lower()
    for match in _MISSING_COLUMN.finditer(body):
        name = match.group(1) or match.group(2)
        if name in sent_columns:
            return name
    # Some builds only echo the name, so fall back to looking for ours in it.
    if "does not exist" in body or "schema cache" in body:
        for name in sent_columns:
            if f"'{name}'" in body or f'"{name}"' in body:
                return name
    return None


def upsert_ipos(rows):
    """Insert or update IPO rows, keyed on slug.

    A column the database does not have yet is dropped and the batch retried
    once, loudly, rather than failing the run.
    """
    if not rows:
        return 0
    written = 0
    for batch in group_by_shape(rows):
        response = _post_batch(batch)

        sent = set(batch[0]) if batch else set()
        missing = _column_not_in_database(response, sent)
        if missing:
            print(
                f"  WARNING: the database has no '{missing}' column, so that "
                f"field was NOT saved. Apply the migration in "
                f"database/schema.sql, then it will fill in on the next run."
            )
            batch = [
                {k: v for k, v in row.items() if k != missing} for row in batch
            ]
            response = _post_batch(batch)

        response.raise_for_status()
        written += len(batch)
    return written


def _post_batch(batch):
    """One merge-upsert request. Never raises — the caller decides."""
    return requests.post(
        config.supabase_url("ipos") + "?on_conflict=slug",
        headers=_headers({"Prefer": "resolution=merge-duplicates,return=minimal"}),
        json=batch,
        timeout=config.REQUEST_TIMEOUT_SECONDS,
    )


def append_gmp_history(snapshots):
    """snapshots: [{"slug": ..., "gmp": ...}]"""
    if not snapshots:
        return 0
    response = requests.post(
        config.supabase_url("gmp_history"),
        headers=_headers({"Prefer": "return=minimal"}),
        json=snapshots,
        timeout=config.REQUEST_TIMEOUT_SECONDS,
    )
    response.raise_for_status()
    return len(snapshots)


def append_subscription_history(rows):
    """One snapshot per open IPO that reports subscription figures."""
    snapshots = [
        {
            "slug": row["slug"],
            "qib": row.get("subscription_qib"),
            "nii": row.get("subscription_nii"),
            "retail": row.get("subscription_retail"),
            "total": row.get("subscription_total"),
        }
        for row in rows
        if row.get("subscription_total") is not None
    ]
    if not snapshots:
        return 0
    response = requests.post(
        config.supabase_url("subscription_history"),
        headers=_headers({"Prefer": "return=minimal"}),
        json=snapshots,
        timeout=config.REQUEST_TIMEOUT_SECONDS,
    )
    response.raise_for_status()
    return len(snapshots)


def log_run(source, ok, records=0, message=None, duration_ms=None):
    """Write a health record so you can see whether the scheduler is alive."""
    try:
        requests.post(
            config.supabase_url("scrape_runs"),
            headers=_headers({"Prefer": "return=minimal"}),
            json=[
                {
                    "source": source,
                    "ok": ok,
                    "records": records,
                    "message": (message or "")[:500] or None,
                    "duration_ms": duration_ms,
                }
            ],
            timeout=config.REQUEST_TIMEOUT_SECONDS,
        )
    except requests.RequestException:
        pass  # health logging must never break the run
