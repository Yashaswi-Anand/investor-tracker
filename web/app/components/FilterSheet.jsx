"use client";

/**
 * The filter sheet the phone gets instead of two rows of scrolling pills.
 *
 * The pills work on a desktop where all of them fit. On a phone they run off
 * the edge, so half the filters are behind a sideways swipe nobody knows to
 * make — you cannot choose from a list you cannot see. A sheet shows every
 * option at once, stacked, with a tap target the width of the screen.
 *
 * Choices are staged, not live. The list being filtered is behind the sheet
 * and invisible while it is open, so applying each tap immediately would
 * change nothing anyone can see; instead the Apply button carries the count
 * the current selection would produce, which is the one piece of feedback
 * that is actually useful before committing.
 *
 * Dumb on purpose: it renders the groups it is handed and reports taps. What
 * the filters mean, and what they do to the list, stays in IpoList.
 *
 * Portalled to <body> because the list it belongs to sits inside .sheet,
 * which sets a z-index and so opens a stacking context. Rendered in place,
 * no z-index could lift this above the site header — it would be a modal
 * with the header drawn on top of it.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

/** Long enough to read as a slide, short enough not to feel like waiting. */
const CLOSE_MS = 200;

/** How far down the sheet must be dragged before letting go dismisses it. */
const DISMISS_PX = 90;

function Tick() {
  return (
    <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
      <path
        d="M3 8.4 6.2 11.5 13 4.8"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function FilterSheet({
  open,
  groups,
  onToggle,
  onReset,
  onApply,
  onClose,
  applyLabel,
  activeCount,
}) {
  const [mounted, setMounted] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [dragY, setDragY] = useState(0);

  const panelRef = useRef(null);
  const dragFrom = useRef(null);
  // Where focus was before the sheet took it, so it can be handed back.
  const opener = useRef(null);

  useEffect(() => {
    if (open) {
      opener.current = document.activeElement;
      setMounted(true);
      setLeaving(false);
      setDragY(0);
    } else if (mounted) {
      setLeaving(true);
      const timer = setTimeout(() => setMounted(false), CLOSE_MS);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [open, mounted]);

  // The page behind must not scroll while the sheet is up, or a flick meant
  // for the option list drags the whole dashboard around underneath it. The
  // class goes on with it, so anything else floating over the page (the
  // scroll-jump button) can take itself out of the way.
  useEffect(() => {
    if (!mounted) return undefined;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.body.classList.add("has-sheet");
    return () => {
      document.body.style.overflow = previous;
      document.body.classList.remove("has-sheet");
    };
  }, [mounted]);

  useEffect(() => {
    if (!open) return undefined;
    panelRef.current?.focus();
    return () => {
      // Only take focus back if it is still inside the sheet; a reader who
      // has clicked elsewhere in the meantime should be left where they are.
      const active = document.activeElement;
      if (!active || active === document.body || panelRef.current?.contains(active)) {
        opener.current?.focus?.();
      }
    };
  }, [open]);

  const onKeyDown = useCallback(
    (event) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
        return;
      }
      if (event.key !== "Tab") return;

      // Keep Tab inside the sheet. Without this the next stop is a filter pill
      // behind the scrim, which is invisible and cannot be clicked.
      const focusable = panelRef.current?.querySelectorAll(
        'button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      if (!focusable || !focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
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

  // Drag lives on the grip alone. Put it on the whole sheet and every attempt
  // to scroll the option list would fight the dismiss gesture.
  const startDrag = (event) => {
    dragFrom.current = event.clientY;
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const moveDrag = (event) => {
    if (dragFrom.current == null) return;
    // Downward only: dragging up would lift the sheet off the bottom edge and
    // show a gap under it.
    setDragY(Math.max(0, event.clientY - dragFrom.current));
  };

  const endDrag = () => {
    if (dragFrom.current == null) return;
    const travelled = dragY;
    dragFrom.current = null;
    setDragY(0);
    if (travelled > DISMISS_PX) onClose();
  };

  if (!mounted) return null;

  return createPortal(
    <div
      className="sheet-root"
      data-leaving={leaving || undefined}
      role="presentation"
      onKeyDown={onKeyDown}
    >
      <div className="sheet-scrim" onClick={onClose} />

      <div
        className="sheet-panel"
        role="dialog"
        aria-modal="true"
        aria-label="Filter IPOs"
        tabIndex={-1}
        ref={panelRef}
        style={dragY ? { "--drag": `${dragY}px` } : undefined}
        data-dragging={dragY ? "true" : undefined}
      >
        <div
          className="sheet-grip"
          onPointerDown={startDrag}
          onPointerMove={moveDrag}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        >
          <span className="sheet-grip-bar" />
        </div>

        <div className="sheet-head">
          <h2 className="sheet-title">
            Filters
            {activeCount ? <span className="sheet-badge">{activeCount}</span> : null}
          </h2>
          <button
            type="button"
            className="sheet-close"
            onClick={onClose}
            aria-label="Close filters"
          >
            <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true">
              <path
                d="M5 5l10 10M15 5L5 15"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>

        <div className="sheet-body">
          {groups.map((group) => (
            <section key={group.key} className="sheet-group">
              <h3 className="sheet-group-title">{group.label}</h3>
              {group.hint ? <p className="sheet-hint">{group.hint}</p> : null}

              {/* A single-choice group is a radio group, and says so — the
                  shape of the indicator and the role both have to match, or
                  a screen reader promises a choice the group will not honour. */}
              <div
                className="sheet-options"
                role={group.single ? "radiogroup" : undefined}
                aria-label={group.single ? group.label : undefined}
              >
                {group.options.map((option) => {
                  const on = group.selected.includes(option.key);
                  return (
                    <button
                      key={option.key}
                      type="button"
                      className="sheet-option"
                      role={group.single ? "radio" : "checkbox"}
                      aria-checked={on}
                      data-on={on || undefined}
                      data-single={group.single || undefined}
                      onClick={() => onToggle(group.key, option.key)}
                    >
                      <span className="sheet-box" aria-hidden="true">
                        {on ? group.single ? <span className="sheet-dot" /> : <Tick /> : null}
                      </span>
                      <span className="sheet-option-label">{option.label}</span>
                      {option.count != null ? (
                        <span className="sheet-count">{option.count}</span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </section>
          ))}
        </div>

        <div className="sheet-actions">
          <button type="button" className="sheet-reset" onClick={onReset}>
            Reset
          </button>
          <button type="button" className="sheet-apply" onClick={onApply}>
            {applyLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
