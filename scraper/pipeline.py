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

import requests

import config
import db
import util
from sources import gmp as gmp_source
from sources import nse
from sources import listing as listing_source
from sources import timetable as timetable_source


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


def gmp_is_observed(row, existing_row):
    """Whether this run actually has a premium worth recording in history.

    A locked GMP is maintained by hand and is authoritative on every run, so
    it keeps building a trend. But when the source gave us nothing and the
    value is not locked, effective_gmp falls back to the STORED number —
    appending that to gmp_history would record yesterday's premium as if it
    had been observed today, drawing a confident flat line straight through
    an outage. The GMP history is the one dataset nobody else has; it must
    not contain values we never saw.
    """
    locked = set((existing_row or {}).get("locked") or [])
    if "gmp" in locked:
        return True
    return row.get("gmp") is not None


def effective_listing_date(row, existing_row):
    """The listing date that will actually be stored after this run.

    Mirrors effective_gmp. Two things matter here:

      * A locked listing_date must win, exactly as a locked GMP does.
        Without this, apply_locks correctly holds the column back while the
        status computed from the rejected value is still written — the lock
        protects the evidence and leaks the conclusion.
      * Everything is normalised to ISO first, because status is decided by
        comparing date strings. '01/09/2026' sorts BEFORE today's
        '2026-08-26', so an unnormalised value would promote an IPO that
        lists next month to 'listed' — and nothing ever demotes it.
    """
    locked = set((existing_row or {}).get("locked") or [])
    stored = util.to_date((existing_row or {}).get("listing_date"))
    if "listing_date" in locked:
        return stored
    return util.to_date(row.get("listing_date")) or stored


def apply_listing_status(row, existing_row, today=None):
    """Promote a closed IPO to 'listed' once its listing date has passed.

    NSE's list endpoints never return a listing date, so status derived from
    them alone can only ever reach 'closed'. A scraped or stored listing_date
    is what allows the final transition.
    """
    # Keep what we store in the column ISO too, so a source that hands us a
    # regional format can never reach Postgres ambiguously (03/04 is April 3
    # or March 4 depending on who is reading).
    normalised = util.to_date(row.get("listing_date"))
    if normalised:
        row["listing_date"] = normalised

    listing_date = effective_listing_date(row, existing_row)
    if not listing_date:
        return row
    today = today or datetime.date.today().isoformat()
    if today >= listing_date and row.get("status") in ("closed", "open"):
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
        print("[1/7] Fetching from NSE (official)...")
        rows, fetch_failures = nse.fetch()
        print(f"      {len(rows)} IPOs")
        if not rows:
            message = "NSE returned no records"
            db.log_run("nse", False, 0, message,
                       int((time.time() - started) * 1000))
            return False, message, 0

        # NSE stops listing an IPO within a day or two of it closing, which
        # is usually BEFORE it lists. Pull those back in, or they freeze at
        # 'closed' forever with an empty timetable — every later stage works
        # from this list.
        try:
            carried = db.fetch_unfinished([row["slug"] for row in rows])
            if carried:
                print(f"      + {len(carried)} still in flight, no longer listed by NSE")
                rows.extend(carried)
        except requests.RequestException as error:
            # Enrichment, not the point of the run: NSE's own rows still write.
            print(f"      (could not read in-flight IPOs: {error})")

        print(f"[2/7] GMP source: {config.GMP_SOURCE}")
        gmp_by_slug = gmp_source.fetch(rows)
        for row in rows:
            if row["slug"] in gmp_by_slug:
                row["gmp"] = gmp_by_slug[row["slug"]]
                row["gmp_updated_at"] = row["updated_at"]

        # Read before the timetable fetch, not just before deriving: knowing
        # which IPOs already have their dates is what keeps that fetch down to
        # a handful of requests instead of one per IPO per run.
        print("[3/7] Reading existing rows (locks + stored GMP)...")
        existing = db.fetch_existing([row["slug"] for row in rows])
        locked_count = sum(1 for slug in existing if existing[slug]["locked"])
        print(f"      {locked_count} IPOs have locked columns (left untouched)")

        print("[4/7] Timetable + registrar (only for IPOs still missing it)...")
        timetable_by_slug = timetable_source.fetch(rows, existing)
        for row in rows:
            row.update(timetable_by_slug.get(row["slug"], {}))
        print(f"      {len(timetable_by_slug)} IPOs gained timetable data")

        # After the timetable, because it needs listing_date, and before the
        # derive step, because apply_listing_status reads the same column.
        print("[5/7] Listing price (only for IPOs that have already listed)...")
        listing_by_slug = listing_source.fetch(rows, existing)
        for row in rows:
            row.update(listing_by_slug.get(row["slug"], {}))
        print(f"      {len(listing_by_slug)} IPOs gained a listing price")

        print("[6/7] Computing derived fields from the effective GMP...")
        effective = {}
        observed = set()
        for row in rows:
            existing_row = existing.get(row["slug"])
            value = effective_gmp(row, existing_row)
            effective[row["slug"]] = value
            if gmp_is_observed(row, existing_row):
                observed.add(row["slug"])
            compute_derived(row, value)
            apply_listing_status(row, existing_row)

        print("[7/7] Writing to Supabase...")
        payload = db.apply_locks(rows, existing)
        written = db.upsert_ipos(payload)

        # History uses the effective GMP, so a hand-maintained value still
        # builds a trend and never disagrees with what the site displays.
        # Slugs whose premium was not actually observed this run are skipped,
        # so an outage leaves a gap in the chart rather than a fabricated
        # flat line — see gmp_is_observed.
        snapshots = [
            {"slug": slug, "gmp": value}
            for slug, value in effective.items()
            if value is not None and slug in observed
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
