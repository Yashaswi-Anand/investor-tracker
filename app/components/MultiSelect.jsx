"use client";

/**
 * A dropdown you can pick several things from.
 *
 * Not a native <select multiple>: on a phone that renders as a squat scroll
 * box where selecting a second item without losing the first needs a
 * modifier key nobody has. This is a button, a popover, and a checkbox per
 * row — the same shape every filter on the site already uses.
 *
 * The search box appears once the list is long enough to need one. Below
 * that it is only a thing to tab past.
 */

import { useEffect, useMemo, useRef, useState } from "react";

/** Above this many options, scanning stops working and searching starts. */
const SEARCH_FROM = 8;

export default function MultiSelect({
  options,
  selected,
  onToggle,
  onSelectAll,
  onClear,
  label,
  placeholder = "Select…",
  emptyText = "Nothing to choose from yet.",
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef(null);
  const searchRef = useRef(null);

  useEffect(() => {
    if (!open) {
      setQuery("");
      return undefined;
    }
    searchRef.current?.focus();
    const away = (event) => {
      if (rootRef.current && !rootRef.current.contains(event.target)) setOpen(false);
    };
    const escape = (event) => event.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", away);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);

  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return options;
    return options.filter(
      (option) =>
        option.label.toLowerCase().includes(needle) ||
        (option.note || "").toLowerCase().includes(needle)
    );
  }, [options, query]);

  const count = selected.length;
  const summary =
    count === 0
      ? placeholder
      : count === 1
        ? options.find((o) => o.key === selected[0])?.label || "1 selected"
        : `${count} selected`;

  return (
    <div className="msel" ref={rootRef}>
      <button
        type="button"
        className="msel-trigger"
        data-filled={count > 0 || undefined}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={label}
        disabled={options.length === 0}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="msel-summary">
          {options.length === 0 ? emptyText : summary}
        </span>
        {count > 0 ? <span className="msel-count">{count}</span> : null}
        <svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true">
          <path
            d="m4 6 4 4 4-4"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      {open ? (
        <div className="msel-pop">
          {options.length > SEARCH_FROM ? (
            <input
              ref={searchRef}
              className="msel-search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search companies…"
              aria-label="Search the list"
            />
          ) : null}

          <div className="msel-bulk">
            <button type="button" className="link-btn" onClick={onSelectAll}>
              Select all
            </button>
            <button
              type="button"
              className="link-btn"
              onClick={onClear}
              disabled={count === 0}
            >
              Clear
            </button>
          </div>

          <div className="msel-list" role="listbox" aria-multiselectable="true" aria-label={label}>
            {matches.length === 0 ? (
              <p className="msel-none">Nothing matches that.</p>
            ) : (
              matches.map((option) => {
                const on = selected.includes(option.key);
                return (
                  <button
                    key={option.key}
                    type="button"
                    className="msel-option"
                    role="option"
                    aria-selected={on}
                    data-on={on || undefined}
                    onClick={() => onToggle(option.key)}
                  >
                    <span className="msel-box" aria-hidden="true">
                      {on ? (
                        <svg viewBox="0 0 16 16" width="11" height="11">
                          <path
                            d="M3 8.4 6.2 11.5 13 4.8"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2.6"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      ) : null}
                    </span>
                    <span className="msel-text">
                      <span className="msel-label">{option.label}</span>
                      {option.note ? (
                        <span className="msel-note">{option.note}</span>
                      ) : null}
                    </span>
                    {option.tag ? <span className="msel-tag">{option.tag}</span> : null}
                  </button>
                );
              })
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
