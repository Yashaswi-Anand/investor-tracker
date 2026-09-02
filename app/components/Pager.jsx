"use client";

/**
 * Numbered pages, for the lists that page rather than grow.
 *
 * Shared by the IPO table and the news feed so the two behave identically —
 * the same window of numbers, the same disabled arrows at the ends, the same
 * range readout. Scrolling back to the top of the list on a page turn is the
 * caller's job, because only the caller knows what "the top of the list" is.
 */

/**
 * The page buttons to draw: every page while there are few, otherwise the
 * first, the last, and a window around where the reader is, with gaps marking
 * what was left out. Twenty numbered buttons in a row is not navigation, it
 * is a wall.
 */
export function pageWindow(current, total) {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);

  const wanted = [1, total, current - 1, current, current + 1]
    .filter((page) => page >= 1 && page <= total)
    .sort((a, b) => a - b);

  const out = [];
  let previous = 0;
  for (const page of wanted) {
    if (page === previous) continue;
    if (page - previous > 1) out.push("gap");
    out.push(page);
    previous = page;
  }
  return out;
}

export default function Pager({ current, pageCount, from, to, total, label, onGo }) {
  if (pageCount <= 1) return null;

  return (
    <nav className="pager" aria-label={label}>
      <button
        type="button"
        className="pager-step"
        onClick={() => onGo(current - 1)}
        disabled={current === 1}
        aria-label="Previous page"
      >
        <span aria-hidden="true">&lsaquo;</span>
      </button>

      <ol className="pager-pages">
        {pageWindow(current, pageCount).map((entry, index) =>
          entry === "gap" ? (
            <li key={`gap-${index}`} className="pager-gap" aria-hidden="true">
              &hellip;
            </li>
          ) : (
            <li key={entry}>
              <button
                type="button"
                className="pager-page"
                data-active={entry === current || undefined}
                aria-current={entry === current ? "page" : undefined}
                aria-label={`Page ${entry}`}
                onClick={() => onGo(entry)}
              >
                {entry}
              </button>
            </li>
          )
        )}
      </ol>

      <button
        type="button"
        className="pager-step"
        onClick={() => onGo(current + 1)}
        disabled={current === pageCount}
        aria-label="Next page"
      >
        <span aria-hidden="true">&rsaquo;</span>
      </button>

      {/* Live, because after a page turn the numbers are the only thing that
          says where the reader now is. */}
      <p className="pager-range" aria-live="polite">
        {from}&ndash;{to} of {total}
      </p>
    </nav>
  );
}
