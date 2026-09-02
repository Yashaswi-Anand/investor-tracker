"use client";

/**
 * The phone half of paging: a list that grows as its end comes into view.
 *
 * Shared by the IPO cards and the news feed. Page buttons at the bottom of a
 * column you are already thumbing past are the wrong control on a phone; on a
 * desktop, where the same list is a table you scan, they are the right one.
 * Both lists therefore run this alongside a Pager and let CSS decide which is
 * on screen.
 *
 * Whichever view is hidden costs nothing. A display:none element has no
 * layout box, so its sentinel never intersects and the list never grows.
 */

import { useCallback, useEffect, useRef, useState } from "react";

/** Start a little before the end is reached, so the next batch is already
 *  there by the time the reader would have seen the bottom. */
const LOOKAHEAD = "320px 0px";

export default function useGrowOnScroll(total, chunk) {
  const [shown, setShown] = useState(chunk);
  const sentinelRef = useRef(null);
  const more = shown < total;

  /**
   * Rebuilt on every growth on purpose. An observer only reports CHANGES in
   * intersection, so when a batch is shorter than the screen the sentinel
   * stays visible, nothing changes, and the list stalls until the reader
   * scrolls again. A fresh observer reports the state it finds, which loads
   * the next batch immediately and keeps going until the end is off-screen.
   */
  useEffect(() => {
    if (!more) return undefined;
    const node = sentinelRef.current;
    if (!node || typeof IntersectionObserver === "undefined") return undefined;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setShown((count) => count + chunk);
        }
      },
      { rootMargin: LOOKAHEAD }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [more, shown, chunk]);

  const reset = useCallback(() => setShown(chunk), [chunk]);
  const growNow = useCallback(() => setShown((count) => count + chunk), [chunk]);

  return { shown, more, sentinelRef, reset, growNow };
}
