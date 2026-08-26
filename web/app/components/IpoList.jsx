"use client";

/**
 * Dashboard list with status filter tabs, search and sorting.
 *
 * Renders as cards on phones (what the Android app shows) and as a table on
 * desktop — one component, switched by CSS so there is no layout shift and
 * no duplicated data.
 */

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { closingLabel, fmtDate, inr, istToday, priceBand, times } from "../../lib/format";
import Sparkline from "./Sparkline";
import { EstListing, GmpValue, Stat, StatusBadge } from "./ui";

const TABS = [
  { key: "all", label: "All" },
  { key: "open", label: "Open" },
  { key: "upcoming", label: "Upcoming" },
  { key: "closed", label: "Closed" },
  { key: "listed", label: "Listed" },
];

const BOARDS = [
  { key: "all", label: "All boards" },
  { key: "mainboard", label: "Mainboard" },
  { key: "sme", label: "SME" },
];

/** Sort options offered in the mobile dropdown, in menu order. */
const SORTS = [
  { key: "default", label: "Live issues first" },
  { key: "gmp", label: "GMP (high → low)" },
  { key: "gmp_pct", label: "GMP % (high → low)" },
  { key: "subs", label: "Subscription (high → low)" },
  { key: "close", label: "Closing soonest" },
  { key: "min", label: "Min investment (low → high)" },
  { key: "name", label: "Company (A → Z)" },
];

/**
 * The direction a column sorts on its FIRST click.
 *
 * Money and demand read high-to-low (the biggest premium is the story), while
 * dates and names read low-to-high. Clicking the same header again flips it.
 */
const FIRST_DIR = {
  name: "asc",
  board: "asc",
  gmp: "desc",
  gmp_pct: "desc",
  price: "desc",
  lot: "asc",
  min: "asc",
  close: "asc",
  subs: "desc",
};

const TAB_KEYS = TABS.map((t) => t.key);
const BOARD_KEYS = BOARDS.map((b) => b.key);
const SORT_KEYS = SORTS.map((s) => s.key);

const boardOf = (ipo) => (ipo.board || "Mainboard").toLowerCase();

/** The comparable value behind each sortable column. */
function sortValue(ipo, key) {
  switch (key) {
    case "name":
      return (ipo.short_name || ipo.name || "").toLowerCase();
    case "board":
      return boardOf(ipo);
    case "gmp":
      return ipo.gmp;
    case "gmp_pct":
      return ipo.gmp != null && ipo.price_band_high
        ? ipo.gmp / ipo.price_band_high
        : null;
    case "price":
      return ipo.price_band_high;
    case "lot":
      return ipo.lot_size;
    case "min":
      return ipo.min_investment;
    case "close":
      return ipo.close_date || null;
    case "subs":
      return ipo.subscription_total;
    default:
      return null;
  }
}

/**
 * Compare two IPOs on a column.
 *
 * Missing values always sink to the bottom regardless of direction — sorting
 * by GMP should surface the highest premium, not a wall of IPOs whose premium
 * has not been recorded yet.
 */
function compare(a, b, key, dir) {
  const av = sortValue(a, key);
  const bv = sortValue(b, key);
  const aEmpty = av == null || av === "";
  const bEmpty = bv == null || bv === "";
  if (aEmpty && bEmpty) return 0;
  if (aEmpty) return 1;
  if (bEmpty) return -1;

  const result =
    typeof av === "number" && typeof bv === "number"
      ? av - bv
      : String(av).localeCompare(String(bv));
  return dir === "desc" ? -result : result;
}

/**
 * A table header that sorts the column it labels.
 *
 * Declared at module scope on purpose. A component defined inside IpoList
 * would be a brand-new type on every render, so React would tear down and
 * rebuild every header cell each time the list changed — dropping keyboard
 * focus and discarding the very click that triggered the re-render.
 */
function SortTh({ sortKey, sort, onSort, children }) {
  const on = sort.key === sortKey;
  return (
    <th
      data-sortable="true"
      data-active={on}
      data-dir={on ? sort.dir : undefined}
      aria-sort={on ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}
    >
      <button type="button" className="th-sort" onClick={() => onSort(sortKey)}>
        <span>{children}</span>
        <span className="th-arrow" aria-hidden="true" />
      </button>
    </th>
  );
}

export default function IpoList({ ipos }) {
  const [active, setActive] = useState("all");
  const [board, setBoard] = useState("all");
  const [query, setQuery] = useState("");
  const [closingToday, setClosingToday] = useState(false);
  const [sort, setSort] = useState({ key: "default", dir: "desc" });

  // Read ?tab= / ?board= on the client rather than from server searchParams,
  // so the page keeps one cacheable render. This also makes the app-manifest
  // shortcut ("/?tab=open") work and makes filter links shareable.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tab = params.get("tab");
    const requestedBoard = params.get("board");
    const requestedSort = params.get("sort");
    if (tab && TAB_KEYS.includes(tab)) setActive(tab);
    if (requestedBoard && BOARD_KEYS.includes(requestedBoard)) setBoard(requestedBoard);
    if (requestedSort && SORT_KEYS.includes(requestedSort)) {
      setSort({ key: requestedSort, dir: FIRST_DIR[requestedSort] || "desc" });
    }
  }, []);

  const setParam = (name, key) => {
    const url = new URL(window.location.href);
    if (key === "all" || key === "default") url.searchParams.delete(name);
    else url.searchParams.set(name, key);
    window.history.replaceState(null, "", url);
  };

  const selectTab = (key) => {
    setActive(key);
    setParam("tab", key);
  };

  const selectBoard = (key) => {
    setBoard(key);
    setParam("board", key);
  };

  /** Header click: switch column, or flip direction when already on it. */
  const selectSort = (key) => {
    const next =
      sort.key === key
        ? { key, dir: sort.dir === "asc" ? "desc" : "asc" }
        : { key, dir: FIRST_DIR[key] || "desc" };
    setSort(next);
    setParam("sort", next.key);
  };

  /** Dropdown pick: always the column's natural direction. */
  const chooseSort = (key) => {
    setSort({ key, dir: FIRST_DIR[key] || "desc" });
    setParam("sort", key);
  };

  // Status counts respect the board filter, and board counts respect the
  // status filter — each row of pills reflects what the other has narrowed.
  const byBoard = useMemo(
    () => (board === "all" ? ipos : ipos.filter((i) => boardOf(i) === board)),
    [ipos, board]
  );

  const counts = useMemo(() => {
    const map = { all: byBoard.length };
    for (const ipo of byBoard) {
      map[ipo.status] = (map[ipo.status] || 0) + 1;
    }
    return map;
  }, [byBoard]);

  const byStatus = useMemo(
    () => (active === "all" ? ipos : ipos.filter((i) => i.status === active)),
    [ipos, active]
  );

  const boardCounts = useMemo(() => {
    const map = { all: byStatus.length, mainboard: 0, sme: 0 };
    for (const ipo of byStatus) {
      map[boardOf(ipo)] = (map[boardOf(ipo)] || 0) + 1;
    }
    return map;
  }, [byStatus]);

  // Bids close at the end of the closing day, so "closing today" is the last
  // call to apply — worth a one-tap filter during the hours it matters.
  const today = istToday();
  const closingCount = useMemo(
    () => ipos.filter((i) => i.close_date === today).length,
    [ipos, today]
  );

  /** Everything the tabs allow, before search and sorting. */
  const filtered = useMemo(
    () => byBoard.filter((i) => active === "all" || i.status === active),
    [byBoard, active]
  );

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    let rows = filtered;

    if (closingToday) rows = rows.filter((i) => i.close_date === today);

    if (needle) {
      rows = rows.filter((i) =>
        `${i.name || ""} ${i.short_name || ""} ${i.symbol || ""}`
          .toLowerCase()
          .includes(needle)
      );
    }

    // The server already ordered by status then date; only re-sort when the
    // reader asked for a different column.
    if (sort.key !== "default") {
      rows = [...rows].sort((a, b) => compare(a, b, sort.key, sort.dir));
    }
    return rows;
  }, [filtered, query, closingToday, today, sort]);

  if (!ipos.length) {
    return (
      <div className="empty">
        No IPO data yet. The scraper fills this in on its next run.
      </div>
    );
  }

  const narrowed = visible.length !== filtered.length;


  return (
    <>
      <div className="tabs" role="tablist" aria-label="Filter by status">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            role="tab"
            className="tab"
            data-active={active === tab.key}
            aria-selected={active === tab.key}
            onClick={() => selectTab(tab.key)}
          >
            {tab.label}
            {counts[tab.key] ? (
              <span className="tab-count">{counts[tab.key]}</span>
            ) : null}
          </button>
        ))}
      </div>

      <div className="tabs tabs-board" role="tablist" aria-label="Filter by board">
        {BOARDS.map((item) => (
          <button
            key={item.key}
            type="button"
            role="tab"
            className="tab tab-sm"
            data-active={board === item.key}
            aria-selected={board === item.key}
            onClick={() => selectBoard(item.key)}
          >
            {item.label}
            {boardCounts[item.key] ? (
              <span className="tab-count">{boardCounts[item.key]}</span>
            ) : null}
          </button>
        ))}
      </div>

      <div className="toolbar">
        <div className="search">
          <svg className="search-icon" viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
          <input
            type="search"
            className="search-input"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search company…"
            aria-label="Search IPOs by company name"
          />
          {query ? (
            <button
              type="button"
              className="search-clear"
              onClick={() => setQuery("")}
              aria-label="Clear search"
            >
              ×
            </button>
          ) : null}
        </div>

        {closingCount > 0 ? (
          <button
            type="button"
            className="chip"
            data-active={closingToday}
            aria-pressed={closingToday}
            onClick={() => setClosingToday((v) => !v)}
          >
            Closing today
            <span className="tab-count">{closingCount}</span>
          </button>
        ) : null}

        <label className="sort-field">
          <span className="sort-label">Sort</span>
          <select
            className="sort-select"
            value={sort.key}
            onChange={(e) => chooseSort(e.target.value)}
            aria-label="Sort IPOs"
          >
            {SORTS.map((option) => (
              <option key={option.key} value={option.key}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {narrowed && visible.length > 0 ? (
        <p className="result-note">
          Showing {visible.length} of {filtered.length}
        </p>
      ) : null}

      {visible.length === 0 ? (
        <div className="empty">
          {query.trim() || closingToday ? (
            <>
              No IPO matches that filter.{" "}
              <button
                type="button"
                className="link-btn"
                onClick={() => {
                  setQuery("");
                  setClosingToday(false);
                }}
              >
                Clear filters
              </button>
            </>
          ) : (
            <>
              No {active === "all" ? "" : `${active} `}
              {board === "all"
                ? "IPOs"
                : `${board === "sme" ? "SME" : "Mainboard"} IPOs`}{" "}
              right now.
            </>
          )}
        </div>
      ) : (
        <>
          {/* Phone / app view */}
          <div className="card-list">
            {visible.map((ipo) => {
              const closing = closingLabel(ipo, today);
              return (
                <Link
                  key={ipo.slug}
                  href={`/ipo/${ipo.slug}`}
                  className="ipo-card"
                  data-status={(ipo.status || "upcoming").toLowerCase()}
                >
                  <div className="ipo-card-top">
                    <div>
                      <div className="ipo-name">{ipo.short_name || ipo.name}</div>
                      <div className="ipo-meta">
                        {fmtDate(ipo.open_date)} – {fmtDate(ipo.close_date)}
                        {" · "}
                        {ipo.board || "Mainboard"}
                      </div>
                    </div>
                    <div className="card-flags">
                      <StatusBadge status={ipo.status} />
                      {closing ? (
                        <span
                          className="days-left"
                          data-urgent={closing === "Last day"}
                        >
                          {closing}
                        </span>
                      ) : null}
                    </div>
                  </div>
                  <div className="ipo-card-grid">
                    <Stat label="GMP">
                      <GmpValue ipo={ipo} showPercent />
                    </Stat>
                    <Stat label="Est. Listing">
                      <EstListing ipo={ipo} />
                    </Stat>
                    <Stat label="Price Band">{priceBand(ipo)}</Stat>
                    <Stat label="Min Invest">{inr(ipo.min_investment)}</Stat>
                  </div>
                </Link>
              );
            })}
          </div>

          {/* Desktop view */}
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <SortTh sortKey="name" sort={sort} onSort={selectSort}>Company</SortTh>
                  <SortTh sortKey="board" sort={sort} onSort={selectSort}>Board</SortTh>
                  <SortTh sortKey="gmp" sort={sort} onSort={selectSort}>GMP</SortTh>
                  <SortTh sortKey="gmp_pct" sort={sort} onSort={selectSort}>
                    Est. Listing
                  </SortTh>
                  <th>Trend (3d)</th>
                  <SortTh sortKey="price" sort={sort} onSort={selectSort}>Price Band</SortTh>
                  <SortTh sortKey="lot" sort={sort} onSort={selectSort}>Lot</SortTh>
                  <SortTh sortKey="min" sort={sort} onSort={selectSort}>Min Invest</SortTh>
                  <SortTh sortKey="close" sort={sort} onSort={selectSort}>Open – Close</SortTh>
                  <SortTh sortKey="subs" sort={sort} onSort={selectSort}>Subs.</SortTh>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((ipo) => {
                  const closing = closingLabel(ipo, today);
                  return (
                    <tr key={ipo.slug}>
                      <td>
                        <Link href={`/ipo/${ipo.slug}`}>
                          {ipo.short_name || ipo.name}
                        </Link>
                      </td>
                      <td>{ipo.board || "Mainboard"}</td>
                      <td>
                        <GmpValue ipo={ipo} showPercent />
                      </td>
                      <td>
                        <EstListing ipo={ipo} />
                      </td>
                      <td>
                        <Sparkline values={ipo.gmp_spark} />
                      </td>
                      <td>{priceBand(ipo)}</td>
                      <td>{ipo.lot_size ?? "—"}</td>
                      <td>{inr(ipo.min_investment)}</td>
                      <td>
                        {fmtDate(ipo.open_date)} – {fmtDate(ipo.close_date)}
                        {closing ? (
                          <span
                            className="cell-note"
                            data-urgent={closing === "Last day"}
                          >
                            {closing}
                          </span>
                        ) : null}
                      </td>
                      <td>{times(ipo.subscription_total)}</td>
                      <td>
                        <StatusBadge status={ipo.status} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
}
