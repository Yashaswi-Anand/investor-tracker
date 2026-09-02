"use client";

/**
 * One floating button that points wherever you are not.
 *
 * Near the top it offers the bottom; past the halfway mark it offers the top.
 * A single control that turns around is easier to trust than two buttons that
 * appear and disappear, and it is always the same target under the thumb.
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

export default function ScrollJump() {
  // null until measured, which is also what the server renders — there is no
  // scroll position to know about before the page exists.
  const [dir, setDir] = useState(null);

  useEffect(() => {
    let frame = 0;

    const measure = () => {
      frame = 0;
      const max = document.documentElement.scrollHeight - window.innerHeight;
      if (max < MIN_SCROLLABLE) {
        setDir(null);
        return;
      }
      setDir(window.scrollY > max / 2 ? "up" : "down");
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

  if (!dir) return null;

  const up = dir === "up";
  const label = up ? "Back to top" : "Jump to bottom";

  const jump = () => {
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({
      top: up ? 0 : document.documentElement.scrollHeight,
      behavior: still ? "instant" : "smooth",
    });
  };

  return (
    <button
      type="button"
      className="scroll-jump"
      data-dir={dir}
      onClick={jump}
      aria-label={label}
      title={label}
    >
      {/* Drawn pointing up; CSS turns it over for the other direction, so the
          button reads as one thing rotating rather than two icons swapping. */}
      <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
        <path d="M12 19V6M5.5 12.5 12 6l6.5 6.5" />
      </svg>
    </button>
  );
}
