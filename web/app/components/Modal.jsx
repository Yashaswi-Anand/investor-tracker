"use client";

/**
 * The dialog shell both modals use.
 *
 * Cancelling is a first-class outcome here, not a failure: Escape, the
 * backdrop and the × all call the same onClose, and onClose never navigates.
 * That is the behaviour the allotment gate depends on — close the popup,
 * leave the reader exactly where they were, do nothing else.
 *
 * Focus is trapped while it is open and returned to whatever opened it, and
 * the page behind it does not scroll. A modal that leaks focus to the page
 * underneath is unusable with a keyboard and invisible to a screen reader.
 */

import { useCallback, useEffect, useRef } from "react";
import { createPortal } from "react-dom";

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export default function Modal({ title, onClose, children, labelledBy }) {
  const panel = useRef(null);
  const returnTo = useRef(null);

  useEffect(() => {
    returnTo.current = document.activeElement;
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";

    // Focus the first thing worth focusing, not the panel itself, so the
    // reader lands on the control they came for.
    const first = panel.current?.querySelector(FOCUSABLE);
    (first || panel.current)?.focus();

    return () => {
      document.body.style.overflow = overflow;
      const back = returnTo.current;
      if (back && typeof back.focus === "function") back.focus();
    };
  }, []);

  const onKeyDown = useCallback(
    (event) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
        return;
      }
      if (event.key !== "Tab") return;
      const items = [...(panel.current?.querySelectorAll(FOCUSABLE) || [])];
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    },
    [onClose]
  );

  // Rendered on <body>, not where the caller sits: an ancestor with a
  // transform or animation (the account cards rise in) becomes the box that
  // position:fixed is measured against, and the dialog opened inside a card.
  if (typeof document === "undefined") return null;

  return createPortal(
    <div className="modal-root" onKeyDown={onKeyDown}>
      <div
        className="modal-scrim"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        className="modal-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        ref={panel}
        tabIndex={-1}
      >
        <div className="modal-head">
          <h2 className="modal-title" id={labelledBy}>
            {title}
          </h2>
          <button
            type="button"
            className="modal-close"
            onClick={onClose}
            aria-label="Close"
          >
            ×
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body
  );
}
