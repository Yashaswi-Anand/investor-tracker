"""
The pipeline: fetch -> resolve locks -> derive -> write.

Called by run_once.py (single run) and scheduler.py (every N minutes).

Ordering matters here. Existing rows are read BEFORE derived fields are
computed, because a locked column (e.g. a GMP you maintain by hand) must be
the value that estimated_listing and the GMP history snapshot are based on.
Computing first and locking afterwards would leave the stored GMP saying one
thing and the numbers derived from it saying another.
"""

import datetime
import time
import traceback

import config
import db
from sources import gmp as gmp_source
from sources import nse


def effective_gmp(row, existing_row):
    """The GMP that will actually be in the database after this run.

    When 'gmp' is locked, the scraped value is discarded and the stored value
    wins — so everything downstream must use the stored value too.
    """
    locked = set((existing_row or {}).get("locked") or [])
    if "gmp" in locked:
        return (existing_row or {}).get("gmp")
    scraped = row.get("gmp")
    return scraped if scraped is not None else (existing_row or {}).get("gmp")


def apply_listing_status(row, existing_row, today=None):
    """Promote a closed IPO to 'listed' once its listing date has passed.

    NSE's list endpoints never return a listing date, so status derived from
    them alone can only ever reach 'closed'. The stored listing_date — which
    you fill in by hand, or a future source provides — is what allows the
    final transition.
    """
    listing_date = row.get("listing_date") or (existing_row or {}).get(
        "listing_date"
    )
    if not listing_date:
        return row
    today = today or datetime.date.today().isoformat()
    if today >= str(listing_date) and row.get("status") in ("closed", "open"):
        row["status"] = "listed"
    return row


def compute_derived(row, gmp=None):
    """Fill in values we can calculate rather than fetch."""
    lot = row.get("lot_size")
    high = row.get("price_band_high")
    if row.get("min_investment") is None and lot and high:
        row["min_investment"] = round(lot * high)
    if gmp is not None and high:
        row["estimated_listing"] = round(float(high) + float(gmp), 2)
    return row


def run():
    """Execute one full scrape. Returns (ok, message, record_count)."""
    started = time.time()
    try:
        print("[1/5] Fetching from NSE (official)...")
        rows, fetch_failures = nse.fetch()
        print(f"      {len(rows)} IPOs")
        if not rows:
            message = "NSE returned no records"
            db.log_run("nse", False, 0, message,
                       int((time.time() - started) * 1000))
            return False, message, 0

        print(f"[2/5] GMP source: {config.GMP_SOURCE}")
        gmp_by_slug = gmp_source.fetch(rows)
        for row in rows:
            if row["slug"] in gmp_by_slug:
                row["gmp"] = gmp_by_slug[row["slug"]]
                row["gmp_updated_at"] = row["updated_at"]

        print("[3/5] Reading existing rows (locks + stored GMP)...")
        existing = db.fetch_existing([row["slug"] for row in rows])
        locked_count = sum(1 for slug in existing if existing[slug]["locked"])
        print(f"      {locked_count} IPOs have locked columns (left untouched)")

        print("[4/5] Computing derived fields from the effective GMP...")
        effective = {}
        for row in rows:
            existing_row = existing.get(row["slug"])
            value = effective_gmp(row, existing_row)
            effective[row["slug"]] = value
            compute_derived(row, value)
            apply_listing_status(row, existing_row)

        print("[5/5] Writing to Supabase...")
        payload = db.apply_locks(rows, existing)
        written = db.upsert_ipos(payload)

        # History uses the effective GMP, so a hand-maintained value still
        # builds a trend and never disagrees with what the site displays.
        snapshots = [
            {"slug": slug, "gmp": value}
            for slug, value in effective.items()
            if value is not None
        ]
        gmp_written = db.append_gmp_history(snapshots)
        sub_written = db.append_subscription_history(rows)

        duration = int((time.time() - started) * 1000)
        message = (
            f"{written} IPOs, {gmp_written} GMP snapshots, "
            f"{sub_written} subscription snapshots"
        )
        if fetch_failures:
            # Surfaced in scrape_runs so a degraded run is visible rather
            # than looking identical to a clean one.
            message += f" ({len(fetch_failures)} enrichment failures)"
        print(f"Done in {duration / 1000:.1f}s — {message}")
        db.log_run("nse", True, written, message, duration)
        return True, message, written

    except Exception as error:  # noqa: BLE001 — the scheduler must not die
        duration = int((time.time() - started) * 1000)
        message = f"{type(error).__name__}: {error}"
        print("FAILED:", message)
        traceback.print_exc()
        db.log_run("nse", False, 0, message, duration)
        return False, message, 0
