"""
Run the scraper a single time, then exit.

    python run_once.py            # scrape and write to Supabase
    python run_once.py --dry-run  # scrape and print, write nothing
                                  # (no Supabase keys needed)
"""

import json
import sys

import config
from pipeline import compute_derived, run
from sources import gmp as gmp_source
from sources import nse
from sources import listing as listing_source
from sources import timetable as timetable_source

INTERESTING = (
    "slug", "name", "board", "status", "symbol",
    "price_band_low", "price_band_high", "lot_size", "min_investment",
    "face_value", "open_date", "close_date", "gmp", "estimated_listing",
    "allotment_date", "refund_date", "demat_date", "listing_date",
    "registrar", "registrar_url", "listing_price", "listing_gain_pct",
    "subscription_qib", "subscription_nii", "subscription_retail",
    "subscription_total", "issue_size",
)


def dry_run():
    """Fetch from every source and print, without touching the database."""
    print("DRY RUN — nothing will be written to the database.\n")
    print("Fetching from NSE...")
    rows, failures = nse.fetch()
    print(f"  {len(rows)} IPOs")
    if failures:
        print(f"  {len(failures)} enrichment request(s) failed")
    print()

    print(f"GMP source: {config.GMP_SOURCE}")
    gmp_by_slug = gmp_source.fetch(rows)
    for row in rows:
        if row["slug"] in gmp_by_slug:
            row["gmp"] = gmp_by_slug[row["slug"]]
    # With no database to read, every IPO looks like it still needs its
    # timetable, so a dry run shows what the source WOULD collect — bounded by
    # config.TIMETABLE_MAX_FETCHES_PER_RUN, same as a real run.
    print(f"\nTimetable source: {config.TIMETABLE_SOURCE}")
    timetable_by_slug = timetable_source.fetch(rows, {})
    for row in rows:
        row.update(timetable_by_slug.get(row["slug"], {}))
    print(f"  {len(timetable_by_slug)} IPOs with timetable data")

    # Same shape as a real run: with no database, every listed IPO looks
    # like it still needs a price, so this shows what WOULD be fetched.
    print(f"\nListing source: {config.LISTING_SOURCE}")
    listing_by_slug = listing_source.fetch(rows, {})
    for row in rows:
        row.update(listing_by_slug.get(row["slug"], {}))
    print(f"  {len(listing_by_slug)} IPOs with a listing price")

    rows = [compute_derived(row, row.get("gmp")) for row in rows]

    print(f"\n{'=' * 70}")
    for row in rows:
        print(f"\n{row.get('name')}  [{row.get('board')}] — {row.get('status')}")
        for key in INTERESTING:
            if key in ("slug", "name", "board", "status"):
                continue
            value = row.get(key)
            if value is not None:
                text = str(value)
                print(f"    {key:<22} {text[:70]}")

    filled = sum(1 for r in rows if r.get("lot_size"))
    print(f"\n{'=' * 70}")
    print(f"{len(rows)} IPOs — {filled} with lot size, "
          f"{sum(1 for r in rows if r.get('gmp') is not None)} with GMP")
    return 0 if rows else 1


if __name__ == "__main__":
    if "--dry-run" in sys.argv:
        sys.exit(dry_run())
    config.validate()
    ok, _, _ = run()
    sys.exit(0 if ok else 1)
