"""
Long-running scheduler: runs the pipeline every INTERVAL_MINUTES.

Start it with run-scheduler.bat and leave the window open, or deploy it to
any always-on host. For a laptop that sleeps, prefer a cloud cron (see
README) so data keeps refreshing when the machine is off.
"""

import datetime
import time

import config
from pipeline import run


def main():
    config.validate()
    interval = config.INTERVAL_MINUTES * 60
    print(
        f"IPO scraper scheduler started — every {config.INTERVAL_MINUTES} minutes."
    )
    print("Press Ctrl+C to stop.\n")

    while True:
        stamp = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        print(f"===== run at {stamp} =====")
        run()
        nxt = datetime.datetime.now() + datetime.timedelta(seconds=interval)
        print(f"Next run at {nxt.strftime('%H:%M:%S')}\n")
        time.sleep(interval)


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\nScheduler stopped.")
