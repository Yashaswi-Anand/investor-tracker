"use client";

/**
 * Back to top, once there is a top worth going back to.
 *
 * It stays out of the way until the reader has actually travelled — roughly
 * one screen down — and then offers the only jump anyone wants from there.
 * A "go to bottom" arrow was the other half of this and has been dropped:
 * near the top of a list nobody is trying to reach the footer, and an arrow
 * that changes meaning as you scroll is one more thing to work out mid-flick.
 *
 * It hides itself on any page short enough that jumping is not worth a tap.
 * That check has to be re-run on more than scroll and resize: the phone list
 * grows as the reader reaches its end, so the page gets taller without either
 * event ever firing — hence the ResizeObserver.
 */

import { useEffect, useState } from "react";

/**
 * Below this much scrollable height the button never appears. Roughly a
 * flick: if the whole page is within reach anyway, a shortcut to the end of
 * it is furniture, not help.
 */
const MIN_SCROLLABLE = 240;

/** How far down counts as "travelled" — about one screen. */
const SHOW_AFTER = 0.9;

export default function ScrollJump() {
  // false until measured, which is also what the server renders — there is
  // no scroll position to know about before the page exists.
  const [show, setShow] = useState(false);

  useEffect(() => {
    let frame = 0;

    const measure = () => {
      frame = 0;
      const max = document.documentElement.scrollHeight - window.innerHeight;
      setShow(
        max >= MIN_SCROLLABLE && window.scrollY > window.innerHeight * SHOW_AFTER
      );
    };

    // Scroll fires far more often than the answer can change; one frame is
    // the most often it is worth asking.
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(measure);
    };

    measure();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);

    const observer =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(schedule);
    if (observer) observer.observe(document.body);

    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      if (observer) observer.disconnect();
    };
  }, []);

  if (!show) return null;

  const jump = () => {
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top: 0, behavior: still ? "instant" : "smooth" });
  };

  return (
    <button
      type="button"
      className="scroll-jump"
      onClick={jump}
      aria-label="Back to top"
      title="Back to top"
    >
      <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
        <path d="M12 19V6M5.5 12.5 12 6l6.5 6.5" />
      </svg>
    </button>
  );
}
