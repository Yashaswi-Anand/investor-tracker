"""
One-off data repairs, run by hand and never by the cron.

Kept apart from run_once.py on purpose: the scraper writes rows and this
deletes them, and the two should not share an entry point where a stray
argument could turn a scheduled scrape into a purge.

    python maintenance.py clean-zero-subscriptions            # dry run
    python maintenance.py clean-zero-subscriptions --apply    # actually delete

Nothing here writes without --apply. The dry run prints exactly what the
real run would touch, and is what the GitHub workflow shows you before you
type the confirmation that lets it proceed.

WHY THIS EXISTS RATHER THAN A SQL SNIPPET. subscription_history has RLS
enabled with a SELECT policy and no DELETE policy, so a delete run from the
SQL editor as anon or authenticated silently matches nothing and reports
success. The service_role key this module uses bypasses RLS, which is the
same key and the same path the scraper already writes through.
"""

import argparse
import sys

import requests

import config
import db


def _fetch_all(url, page=1000):
    """Every row PostgREST will give us, a page at a time."""
    rows = []
    while True:
        response = requests.get(
            url,
            headers=db._headers({"Range": f"{len(rows)}-{len(rows) + page - 1}"}),
            timeout=config.REQUEST_TIMEOUT_SECONDS,
        )
        response.raise_for_status()
        batch = response.json()
        rows.extend(batch)
        if len(batch) < page:
            return rows


# Every figure zero or null. Such a row cannot tell "nothing has been bid
# yet" from "we could not read the figures", and on the day-wise chart it
# draws a floor that never happened.
_EMPTY = (
    "and=("
    "or(qib.is.null,qib.eq.0),"
    "or(nii.is.null,nii.eq.0),"
    "or(retail.is.null,retail.eq.0),"
    "or(total.is.null,total.eq.0))"
)


def clean_zero_subscriptions(apply=False):
    base = config.supabase_url("subscription_history")
    doomed = _fetch_all(
        f"{base}?select=id,slug,qib,nii,retail,total,recorded_at&{_EMPTY}&order=id.asc"
    )
    total = _fetch_all(f"{base}?select=id&order=id.asc")

    print(f"subscription_history holds {len(total)} rows")
    print(f"{len(doomed)} of them have every figure zero or null\n")

    if not doomed:
        print("Nothing to do.")
        return 0

    by_slug = {}
    for row in doomed:
        by_slug.setdefault(row["slug"], []).append(row["recorded_at"][:10])
    for slug, days in sorted(by_slug.items(), key=lambda kv: -len(kv[1])):
        span = f"{min(days)} .. {max(days)}" if len(set(days)) > 1 else min(days)
        print(f"  {slug[:46]:<46} {len(days):>4} rows   {span}")

    # The guarantee, checked rather than asserted: nothing with a real
    # figure in it can be in this set.
    real = [
        row
        for row in doomed
        if any(
            row.get(column) not in (None, 0, 0.0)
            for column in ("qib", "nii", "retail", "total")
        )
    ]
    print(f"\nrows here holding a real figure: {len(real)} (must be 0)")
    if real:
        print("REFUSING: the filter caught a row with data in it.")
        return 1

    if not apply:
        print(f"\nDry run. Re-run with --apply to delete these {len(doomed)} rows.")
        return 0

    response = requests.delete(
        f"{base}?{_EMPTY}",
        headers=db._headers({"Prefer": "return=minimal"}),
        timeout=config.REQUEST_TIMEOUT_SECONDS,
    )
    response.raise_for_status()

    left = _fetch_all(f"{base}?select=id&{_EMPTY}&order=id.asc")
    remaining = _fetch_all(f"{base}?select=id&order=id.asc")
    print(f"\nDeleted. {len(remaining)} rows remain, {len(left)} of them still empty.")
    # RLS failure looks exactly like success on a DELETE, so the count is
    # read back rather than trusted.
    return 0 if not left else 1


COMMANDS = {"clean-zero-subscriptions": clean_zero_subscriptions}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=sorted(COMMANDS))
    parser.add_argument(
        "--apply",
        action="store_true",
        help="actually write; without it nothing is deleted",
    )
    args = parser.parse_args()

    if not config.SUPABASE_SERVICE_KEY:
        print("SUPABASE_SERVICE_KEY is not set — nothing can be written.")
        return 1
    return COMMANDS[args.command](apply=args.apply)


if __name__ == "__main__":
    sys.exit(main())
