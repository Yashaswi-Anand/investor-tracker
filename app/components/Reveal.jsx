"use client";

/**
 * Plays a chart or a set of figures in when it scrolls into view, and resets
 * when it leaves so it plays again on the way back.
 *
 * Two attributes drive everything, and the order matters:
 *
 *   data-anim="on"  is set only once the IntersectionObserver has actually
 *                   reported something. That is deliberate and it is the
 *                   whole safety story: arming on mount instead meant that
 *                   wherever the observer never fires, every figure sat at
 *                   zero and every chart stayed blank — permanently, and far
 *                   worse than simply not animating. The observer speaking
 *                   at all is the proof that it works; until it does, and
 *                   forever without JavaScript or under reduced motion, the
 *                   CSS leaves the server's finished state alone.
 *   data-inview     toggles with the observer and is what plays the
 *                   animation.
 *
 * Numbers count up from zero rather than being re-rendered, because the server
 * has already formatted them — "₹1,22,400", "50.86x", "₹50 – ₹53" — and
 * re-deriving that on the client would mean a second copy of every formatter,
 * free to disagree with the first. Instead each numeric run inside the text is
 * scaled and the surrounding characters are left exactly as they were, and the
 * original string is restored at the end so what remains is byte-identical to
 * what the server sent.
 */

import { useEffect, useRef, useState } from "react";

const DURATION = 900;

/** Digits with optional separators and decimals — "1,22,400", "39.5", "83". */
const NUMBER = /\d[\d,]*(?:\.\d+)?/g;

const easeOut = (t) => 1 - Math.pow(1 - t, 3);

/**
 * Rebuild a formatted string with every number in it scaled by `progress`,
 * keeping each one's decimal places and grouping style.
 */
function scaleNumbers(text, progress) {
  return text.replace(NUMBER, (match) => {
    const grouped = match.includes(",");
    const dot = match.indexOf(".");
    const decimals = dot === -1 ? 0 : match.length - dot - 1;
    const value = Number(match.replace(/,/g, ""));
    if (!Number.isFinite(value)) return match;
    const now = value * progress;
    return now.toLocaleString(grouped ? "en-IN" : "en-US", {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
      useGrouping: grouped,
    });
  });
}

/**
 * The text nodes worth animating: those that contain a digit and are not
 * inside a [data-nocount] subtree.
 *
 * The opt-out earns its place immediately — a year label counting up from 0
 * to 2024 is nonsense, and so is a date. Only quantities should move.
 */
function numericTextNodes(root) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const out = [];
  let node;
  while ((node = walker.nextNode())) {
    const text = node.nodeValue;
    if (!/\d/.test(text) || text.trim().length > 40) continue;
    if (node.parentElement && node.parentElement.closest("[data-nocount]")) continue;
    out.push({ node, text });
  }
  return out;
}

export default function Reveal({
  children,
  className,
  count = false,
  threshold = 0.2,
  as: Tag = "div",
}) {
  const ref = useRef(null);
  const frame = useRef(0);
  const [armed, setArmed] = useState(false);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        // Arming here, on the first callback, rather than on mount: this is
        // the only moment we know the observer is delivering. Anywhere it is
        // not, nothing is ever armed and the finished state stands.
        setArmed(true);
        setInView(entry.isIntersecting);
      },
      { threshold, rootMargin: "0px 0px -8% 0px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [threshold]);

  useEffect(() => {
    const el = ref.current;
    if (!armed || !count || !el) return;

    const targets = numericTextNodes(el);
    if (!targets.length) return;

    const restore = () => targets.forEach((t) => (t.node.nodeValue = t.text));

    if (!inView) {
      // Out of view: back to zero, ready to run again on the way back.
      targets.forEach((t) => (t.node.nodeValue = scaleNumbers(t.text, 0)));
      // The restore on the way out is not tidiness, it is correctness. Each
      // run reads the current text as the value to count towards, so leaving
      // zeros in the DOM meant the next run adopted "0.00x" as the target and
      // settled there — the subscription figures read 0.00x permanently for
      // anyone who scrolled past them twice.
      return restore;
    }

    const start = performance.now();
    const tick = (now) => {
      const progress = Math.min(1, (now - start) / DURATION);
      if (progress >= 1) {
        restore();
        return;
      }
      const eased = easeOut(progress);
      targets.forEach((t) => (t.node.nodeValue = scaleNumbers(t.text, eased)));
      frame.current = requestAnimationFrame(tick);
    };
    frame.current = requestAnimationFrame(tick);

    // Two backstops, and they are not belt-and-braces — the animation really
    // does stop half way. requestAnimationFrame is paused in a background
    // tab, so switching apps mid-count leaves the figure frozen at whatever
    // fraction it had reached: caught in testing showing ₹20 where the true
    // value was ₹43. A wrong number displayed confidently is the worst thing
    // this site can do, so the final value is restored on a timer whatever
    // the frame loop is doing, and immediately if the page is hidden.
    const settle = setTimeout(restore, DURATION + 200);
    const onHide = () => {
      if (document.visibilityState === "hidden") {
        cancelAnimationFrame(frame.current);
        restore();
      }
    };
    document.addEventListener("visibilitychange", onHide);

    return () => {
      cancelAnimationFrame(frame.current);
      clearTimeout(settle);
      document.removeEventListener("visibilitychange", onHide);
      restore();
    };
  }, [armed, count, inView]);

  return (
    <Tag
      ref={ref}
      className={className}
      data-anim={armed ? "on" : undefined}
      data-inview={armed && inView ? "true" : undefined}
    >
      {children}
    </Tag>
  );
}
