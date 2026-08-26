"""
Supabase writer.

Two guarantees this module makes, so automation can never destroy the data
you curate by hand:

  1. The `manual` jsonb column is never included in any payload.
  2. Column names listed in a row's `locked` array are stripped from the
     payload before the upsert, so those values survive every run.
"""

import requests

import config

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

_EXISTING_COLUMNS = ("slug", "locked", "gmp") + TIMETABLE_COLUMNS


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
            **{column: row.get(column) for column in TIMETABLE_COLUMNS},
        }
        for row in response.json()
    }


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


def upsert_ipos(rows):
    """Insert or update IPO rows, keyed on slug."""
    if not rows:
        return 0
    written = 0
    for batch in group_by_shape(rows):
        response = requests.post(
            config.supabase_url("ipos") + "?on_conflict=slug",
            headers=_headers(
                {"Prefer": "resolution=merge-duplicates,return=minimal"}
            ),
            json=batch,
            timeout=config.REQUEST_TIMEOUT_SECONDS,
        )
        response.raise_for_status()
        written += len(batch)
    return written


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
