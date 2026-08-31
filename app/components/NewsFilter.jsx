"use client";

/**
 * Narrows the headline list to one company.
 *
 * The matching is NOT done here. The server has already run every article
 * against every IPO with the same matchNews() the detail pages use, and hands
 * down a list of companies each with the indices of its stories. Doing it
 * again on the client would be a second implementation of "is this article
 * about this company", free to disagree with the first — and that judgement
 * is the part worth getting right, not the part worth duplicating.
 *
 * Only companies that actually have a story are offered. A dropdown full of
 * names that all lead to "no results" is a worse answer than a shorter list.
 *
 * Two ways in, because they answer different questions. The chips are for
 * "what is everyone writing about" — the handful of issues with the most
 * coverage, one tap away. The combobox is for "is there anything on the one I
 * care about", which is a search, not a browse.
 */

import { useEffect, useId, useMemo, useRef, useState } from "react";
import NewsList from "./NewsList";

const QUICK_CHIPS = 5;

export default function NewsFilter({ articles, companies }) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [picked, setPicked] = useState(null);

  const listId = useId();
  const rootRef = useRef(null);
  const inputRef = useRef(null);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return companies;
    return companies.filter((c) => c.name.toLowerCase().includes(q));
  }, [companies, query]);

  // Already sorted by story count on the server, so the head of the list is
  // the most-covered handful.
  const quick = companies.slice(0, QUICK_CHIPS);

  // A click anywhere else closes the list. Pointerdown rather than click so
  // the list is gone before whatever was clicked reacts.
  useEffect(() => {
    if (!open) return;
    const onAway = (event) => {
      if (rootRef.current && !rootRef.current.contains(event.target)) setOpen(false);
    };
    document.addEventListener("pointerdown", onAway);
    return () => document.removeEventListener("pointerdown", onAway);
  }, [open]);

  const choose = (company) => {
    setPicked(company);
    setQuery(company ? company.name : "");
    setOpen(false);
    setActive(0);
  };

  const clear = () => {
    setPicked(null);
    setQuery("");
    setOpen(false);
  };

  const onKeyDown = (event) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!open) {
        setOpen(true);
        return;
      }
      const step = event.key === "ArrowDown" ? 1 : -1;
      setActive((i) => (matches.length ? (i + step + matches.length) % matches.length : 0));
      return;
    }
    if (event.key === "Enter" && open && matches[active]) {
      event.preventDefault();
      choose(matches[active]);
      return;
    }
    if (event.key === "Escape") {
      setOpen(false);
    }
  };

  const shown = picked
    ? picked.indices.map((i) => articles[i]).filter(Boolean)
    : articles;

  return (
    <>
      <div className="news-toolbar">
        <div className="news-filter" ref={rootRef}>
          <div className="news-filter-field">
            <svg
              className="news-filter-icon"
              viewBox="0 0 16 16"
              width="15"
              height="15"
              fill="none"
              aria-hidden="true"
            >
              <circle cx="7" cy="7" r="4.6" stroke="currentColor" strokeWidth="1.7" />
              <path d="M10.6 10.6 14 14" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
            </svg>
            <input
              id={`${listId}-input`}
              ref={inputRef}
              className="news-filter-input"
              type="text"
              role="combobox"
              autoComplete="off"
              aria-label="Filter headlines by company"
              aria-expanded={open}
              aria-controls={listId}
              aria-autocomplete="list"
              aria-activedescendant={open && matches[active] ? `${listId}-${active}` : undefined}
              placeholder={`Filter ${companies.length} companies in the news`}
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setPicked(null);
                setActive(0);
                setOpen(true);
              }}
              onFocus={() => setOpen(true)}
              onKeyDown={onKeyDown}
            />
            {(picked || query) && (
              <button
                type="button"
                className="news-filter-clear"
                onClick={() => {
                  clear();
                  inputRef.current?.focus();
                }}
                aria-label="Clear the company filter"
              >
                Clear
              </button>
            )}
          </div>

          {open && (
            <ul className="news-filter-list" id={listId} role="listbox">
              {matches.length === 0 ? (
                <li className="news-filter-empty">No company matches that</li>
              ) : (
                matches.map((company, i) => (
                  <li
                    key={company.slug}
                    id={`${listId}-${i}`}
                    role="option"
                    aria-selected={i === active}
                    data-active={i === active || undefined}
                    className="news-filter-option"
                    onPointerEnter={() => setActive(i)}
                    onPointerDown={(e) => {
                      e.preventDefault();
                      choose(company);
                    }}
                  >
                    <span className="news-filter-name">{company.name}</span>
                    <span className="news-filter-count">{company.indices.length}</span>
                  </li>
                ))
              )}
            </ul>
          )}
        </div>

        {quick.length > 1 && (
          <div className="news-chips" role="group" aria-label="Most covered companies">
            <button
              type="button"
              className="news-chip"
              data-on={!picked || undefined}
              onClick={clear}
            >
              All
              <span className="news-chip-count">{articles.length}</span>
            </button>
            {quick.map((company) => (
              <button
                key={company.slug}
                type="button"
                className="news-chip"
                data-on={picked?.slug === company.slug || undefined}
                onClick={() => (picked?.slug === company.slug ? clear() : choose(company))}
              >
                {company.name}
                <span className="news-chip-count">{company.indices.length}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* role="status" so the change is announced: the list below can shrink
          from fifty items to one and a sighted reader sees that instantly. */}
      <p className="news-result" role="status">
        {picked ? (
          <>
            <strong>{shown.length}</strong>{" "}
            {shown.length === 1 ? "story mentions" : "stories mention"}{" "}
            <strong>{picked.name}</strong>
          </>
        ) : (
          <>
            <strong>{articles.length}</strong> latest IPO stories
          </>
        )}
      </p>

      <NewsList articles={shown} lead={!picked} />
    </>
  );
}
