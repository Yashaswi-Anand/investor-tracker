"use client";

/**
 * Dashboard list with status filter tabs, search, sorting and column pinning.
 *
 * Renders as cards on phones (what the Android app shows) and as a table on
 * desktop — one component, switched by CSS so there is no layout shift and
 * no duplicated data.
 *
 * The two views page differently because they are read differently. A table
 * is scanned: you want a known number of rows, a stable header, and the
 * ability to jump — so it paginates. A phone list is thumbed: page buttons
 * would sit at the bottom of a column you are already scrolling past, so it
 * grows as you reach the end instead. Both slice the same sorted array, and
 * whichever view CSS has hidden costs nothing — a display:none list has no
 * layout box, so its sentinel never intersects and it never grows.
 *
 * The table is driven by the COLUMNS array below rather than by hand-written
 * <th>/<td> pairs. With eleven columns, reordering by hand means editing two
 * lists in lockstep and silently shifting every cell in the body if you miss
 * one; here the order lives in exactly one place.
 */

import Link from "next/link";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  fmtDate,
  fmtIssueSize,
  inr,
  issueSizeCrore,
  istToday,
  priceBand,
  times,
  timelineDays,
  timelineLabel,
} from "../../lib/format";
import Sparkline from "./Sparkline";
import { GmpEstimate, Stat, StatusBadge } from "./ui";

const TABS = [
  { key: "all", label: "All" },
  { key: "open", label: "Open" },
  { key: "upcoming", label: "Upcoming" },
  { key: "closed", label: "Closed" },
  { key: "allotment", label: "Allotment" },
  { key: "listed", label: "Listed" },
];

const BOARDS = [
  { key: "all", label: "All boards" },
  { key: "mainboard", label: "Mainboard" },
  { key: "sme", label: "SME" },
];

const SORTS = [
  { key: "default", label: "Live issues first" },
  { key: "gmp", label: "GMP (high → low)" },
  { key: "gmp_pct", label: "GMP % (high → low)" },
  { key: "subs", label: "Subscription (high → low)" },
  { key: "close", label: "Soonest first (countdown)" },
  { key: "issue", label: "Issue size (large → small)" },
  { key: "min", label: "Min investment (low → high)" },
  { key: "name", label: "Company (A → Z)" },
];

/**
 * The direction a column sorts on its FIRST click.
 *
 * Money and demand read high-to-low (the biggest premium is the story), while
 * dates, names and lifecycle order read low-to-high. Clicking again flips it.
 */
const FIRST_DIR = {
  name: "asc",
  status: "asc",
  board: "asc",
  gmp: "desc",
  gmp_pct: "desc",
  price: "desc",
  issue: "desc",
  lot: "asc",
  min: "asc",
  close: "asc",
  subs: "desc",
};

/** Lifecycle order, so sorting by Status walks the timeline. */
const STATUS_RANK = { open: 0, upcoming: 1, closed: 2, allotment: 3, listed: 4 };

/** At most two columns may be pinned; more would leave nothing to scroll. */
const MAX_PINNED = 2;

/**
 * Rows per page in the table.
 *
 * Fifteen rows of eleven columns is already a tall screen; more and the
 * header scrolls away, which is the thing pinning exists to prevent.
 */
const PAGE_SIZE = 15;

/**
 * Cards rendered at first, and added each time the phone list runs out.
 *
 * Eight is roughly two thumb-flicks — long enough that the first batch never
 * looks truncated, short enough that a sixty-issue season does not build
 * sixty cards nobody scrolls to.
 */
const CARD_CHUNK = 8;

const TAB_KEYS = TABS.map((t) => t.key);
const BOARD_KEYS = BOARDS.map((b) => b.key);
const SORT_KEYS = SORTS.map((s) => s.key);

const boardOf = (ipo) => (ipo.board || "Mainboard").toLowerCase();

/**
 * Table columns, in display order. `sort` is the sortValue key, omitted for
 * columns there is no sensible ordering for.
 */
const COLUMNS = [
  {
    key: "name",
    // Company and status in one cell. They were adjacent columns and the
    // status is not a fact about the row so much as a fact about the name —
    // "Hy-Tech Engineers, closed" is one thing a reader takes in, not two.
    // It also buys back a column on a table that already has eleven.
    label: "Company",
    sort: "name",
    render: (ipo) => (
      <Link href={`/ipo/${ipo.slug}`} className="cell-company">
        <span className="cell-company-name">{ipo.short_name || ipo.name}</span>
        <StatusBadge status={ipo.status} />
      </Link>
    ),
  },
  {
    key: "gmp",
    // One column, not two. The premium and the price it implies are the same
    // fact stated twice, and both used to print the same percentage, so every
    // row carried "(+83.0%)" in adjacent cells. Once an issue lists, this
    // becomes what it actually listed at — a reader only ever wants whichever
    // of the two still applies, and an estimate beside a fact invites reading
    // both as live.
    label: "GMP → Listing",
    // Sorted by percentage rather than rupees: both figures in the cell are
    // absolute, and a premium of 60 on a 120 issue is not the proposition a
    // premium of 60 on a 900 issue is. Raw GMP is still in the sort menu.
    sort: "gmp_pct",
    render: (ipo) => <GmpEstimate ipo={ipo} />,
  },
  {
    key: "dates",
    label: "Open – Close",
    sort: "close",
    render: (ipo, { timeline }) => (
      <>
        {fmtDate(ipo.open_date)} – {fmtDate(ipo.close_date)}
        {timeline ? (
          <span className="cell-note" data-urgent={timeline.urgent}>
            {timeline.text}
          </span>
        ) : null}
      </>
    ),
  },
  {
    key: "band",
    label: "Price Band",
    sort: "price",
    render: (ipo) => priceBand(ipo),
  },
  {
    key: "issue",
    label: "Issue Size",
    sort: "issue",
    render: (ipo) => fmtIssueSize(ipo),
  },
  { key: "lot", label: "Lot", sort: "lot", render: (ipo) => ipo.lot_size ?? "—" },
  {
    key: "min",
    label: "Min Invest",
    sort: "min",
    render: (ipo) => inr(ipo.min_investment),
  },
  {
    key: "trend",
    label: "Trend (3d)",
    render: (ipo) => <Sparkline values={ipo.gmp_spark} />,
  },
  { key: "board", label: "Board", sort: "board", render: (ipo) => ipo.board || "Mainboard" },
  {
    key: "subs",
    label: "Subs.",
    sort: "subs",
    render: (ipo) => times(ipo.subscription_total),
  },
];

/**
 * Everything about a row that search should match.
 *
 * The placeholder promises lot size and price, so those have to be in here —
 * an input that says it searches something it does not is worse than one that
 * claims less. Numbers go in unformatted: a reader types 1200, not 1,200.
 */
function haystack(ipo) {
  return [
    ipo.name,
    ipo.short_name,
    ipo.symbol,
    ipo.board,
    ipo.status,
    ipo.lot_size,
    ipo.price_band_low,
    ipo.price_band_high,
    ipo.min_investment,
    ipo.gmp,
  ]
    .filter((value) => value != null && value !== "")
    .join(" ")
    .toLowerCase();
}

/** The comparable value behind each sortable column. */
function sortValue(ipo, key, today) {
  switch (key) {
    case "name":
      return (ipo.short_name || ipo.name || "").toLowerCase();
    case "status":
      return STATUS_RANK[String(ipo.status || "").toLowerCase()] ?? 9;
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
    case "issue": {
      const size = issueSizeCrore(ipo);
      return size ? size.value : null;
    }
    case "lot":
      return ipo.lot_size;
    case "min":
      return ipo.min_investment;
    // Sorted by the countdown the reader can actually see in this column,
    // not by close_date. They differ: an upcoming IPO counts down to its
    // OPEN date and a closed one to its LISTING date, so ordering by
    // close_date would shuffle the visible "2 days left / Opens tomorrow"
    // labels into an order that looks arbitrary.
    case "close":
      return timelineDays(ipo, today);
    case "subs":
      return ipo.subscription_total;
    default:
      return null;
  }
}

/**
 * Settles rows the chosen column cannot separate.
 *
 * Always ascending, never flipped by the sort direction: a tiebreak exists to
 * make the order predictable, and reversing it would make two rows swap
 * places for no reason the reader can see. Lifecycle order comes first, so
 * that among IPOs one day away the one closing beats the one merely opening.
 */
function tiebreak(a, b) {
  const rank =
    (STATUS_RANK[String(a.status || "").toLowerCase()] ?? 9) -
    (STATUS_RANK[String(b.status || "").toLowerCase()] ?? 9);
  if (rank !== 0) return rank;
  return String(a.short_name || a.name || "").localeCompare(
    String(b.short_name || b.name || "")
  );
}

/**
 * Compare two IPOs on a column.
 *
 * Missing values always sink to the bottom regardless of direction — sorting
 * by GMP should surface the highest premium, not a wall of IPOs whose premium
 * has not been recorded yet.
 */
function compare(a, b, key, dir, today) {
  const av = sortValue(a, key, today);
  const bv = sortValue(b, key, today);
  const aEmpty = av == null || av === "";
  const bEmpty = bv == null || bv === "";
  if (aEmpty && bEmpty) return tiebreak(a, b);
  if (aEmpty) return 1;
  if (bEmpty) return -1;

  const result =
    typeof av === "number" && typeof bv === "number"
      ? av - bv
      : String(av).localeCompare(String(bv));
  if (result !== 0) return dir === "desc" ? -result : result;
  return tiebreak(a, b);
}

/**
 * The page buttons to draw: every page while there are few, otherwise the
 * first, the last, and a window around where the reader is, with gaps
 * marking what was left out. Twenty numbered buttons in a row is not
 * navigation, it is a wall.
 */
function pageWindow(current, total) {
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

function PinIcon() {
  return (
    <svg viewBox="0 0 16 16" width="11" height="11" aria-hidden="true">
      <path d="M6 1.5h4l-.5 4 2.5 2.2v1.3H8.6V15h-1.2V9H4V7.7l2.5-2.2z" />
    </svg>
  );
}

/**
 * One table header: its label (sortable or not) plus a pin toggle.
 *
 * Declared at module scope on purpose. A component defined inside IpoList
 * would be a brand-new type on every render, so React would tear down and
 * rebuild every header cell each time the list changed — dropping keyboard
 * focus and discarding the very click that triggered the re-render.
 */
function HeadCell({ column, sort, onSort, pinned, pinEdge, left, onPin }) {
  const active = column.sort && sort.key === column.sort;
  return (
    <th
      data-col={column.key}
      data-active={active || undefined}
      data-dir={active ? sort.dir : undefined}
      data-pinned={pinned || undefined}
      data-pin-edge={pinEdge || undefined}
      style={pinned ? { "--pin-left": `${left}px` } : undefined}
      aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : undefined}
    >
      <div className="th-inner">
        {column.sort ? (
          <button
            type="button"
            className="th-sort"
            onClick={() => onSort(column.sort)}
          >
            <span>{column.label}</span>
            <span className="th-arrow" aria-hidden="true" />
          </button>
        ) : (
          <span className="th-label">{column.label}</span>
        )}
        <button
          type="button"
          className="th-pin"
          data-on={pinned || undefined}
          aria-pressed={Boolean(pinned)}
          title={pinned ? `Unpin ${column.label}` : `Pin ${column.label}`}
          aria-label={pinned ? `Unpin ${column.label}` : `Pin ${column.label}`}
          onClick={() => onPin(column.key)}
        >
          <PinIcon />
        </button>
      </div>
    </th>
  );
}

export default function IpoList({ ipos }) {
  const [active, setActive] = useState("all");
  const [board, setBoard] = useState("all");
  const [query, setQuery] = useState("");
  const [closingToday, setClosingToday] = useState(false);
  const [sort, setSort] = useState({ key: "default", dir: "desc" });
  const [pinned, setPinned] = useState(["name"]);
  const [page, setPage] = useState(1);
  const [shown, setShown] = useState(CARD_CHUNK);

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

  /**
   * Pinning past the limit drops the OLDEST pin rather than refusing.
   * Refusing would leave the reader hunting for which column to release
   * before they can pin the one they actually want.
   */
  const togglePin = (key) => {
    setPinned((current) =>
      current.includes(key)
        ? current.filter((item) => item !== key)
        : [...current, key].slice(-MAX_PINNED)
    );
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

    if (needle) rows = rows.filter((i) => haystack(i).includes(needle));

    // The server already ordered by status then date; only re-sort when the
    // reader asked for a different column.
    if (sort.key !== "default") {
      rows = [...rows].sort((a, b) => compare(a, b, sort.key, sort.dir, today));
    }
    return rows;
  }, [filtered, query, closingToday, today, sort]);

  // Any change to what is being listed sends both views back to the start.
  // Landing on page 4 of a search that returned six rows, or holding forty
  // grown cards while the reader switches to a tab with three, is the kind
  // of stale state that makes a filter feel broken.
  useEffect(() => {
    setPage(1);
    setShown(CARD_CHUNK);
  }, [active, board, query, closingToday, sort.key, sort.dir]);

  const tableRef = useRef(null);
  const sentinelRef = useRef(null);

  const pageCount = Math.max(1, Math.ceil(visible.length / PAGE_SIZE));
  // Clamped rather than trusted: the reset above runs after the render that
  // narrowed the list, so for one paint `page` can still point past the end.
  // Deriving the current page means that paint shows the last page, not a
  // blank table.
  const current = Math.min(page, pageCount);
  const start = (current - 1) * PAGE_SIZE;
  const rows = useMemo(
    () => visible.slice(start, start + PAGE_SIZE),
    [visible, start]
  );

  const cards = useMemo(() => visible.slice(0, shown), [visible, shown]);
  const moreCards = cards.length < visible.length;

  const goToPage = (next) => {
    setPage(Math.min(Math.max(next, 1), pageCount));
    // Without this a new page arrives wherever the old one was left, which
    // reads as the table having quietly rewritten itself rather than turned.
    const table = tableRef.current;
    if (!table) return;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    table.scrollIntoView({
      block: "start",
      inline: "nearest",
      behavior: still ? "instant" : "smooth",
    });
  };

  /**
   * Grow the phone list when its end comes into view.
   *
   * Rebuilt on every growth on purpose. An observer only reports CHANGES in
   * intersection, so when a batch is shorter than the screen the sentinel
   * stays visible, nothing changes, and the list stalls until the reader
   * scrolls again. A fresh observer reports the state it finds, which loads
   * the next batch immediately and keeps going until the end is off-screen.
   */
  useEffect(() => {
    if (!moreCards) return undefined;
    const node = sentinelRef.current;
    if (!node || typeof IntersectionObserver === "undefined") return undefined;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setShown((count) => count + CARD_CHUNK);
        }
      },
      // Start a little before the end is actually reached, so the next cards
      // are already there by the time the reader would have seen the bottom.
      { rootMargin: "320px 0px" }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [moreCards, shown]);

  // A button for the rare browser with no IntersectionObserver. Decided after
  // mount so the server and the first client render agree.
  const [autoGrows, setAutoGrows] = useState(true);
  useEffect(() => {
    setAutoGrows(typeof IntersectionObserver !== "undefined");
  }, []);

  // Pinned columns stick at cumulative offsets, so the second one sits
  // exactly against the first. The widths are whatever the browser resolved,
  // so they have to be measured rather than assumed.
  const [offsets, setOffsets] = useState({});

  useLayoutEffect(() => {
    const measure = () => {
      const table = tableRef.current;
      if (!table) return;
      const next = {};
      let left = 0;
      for (const cell of table.querySelectorAll("thead th")) {
        const key = cell.dataset.col;
        if (!pinned.includes(key)) continue;
        next[key] = Math.round(left);
        left += cell.getBoundingClientRect().width;
      }
      // Bail out when nothing moved: setting state unconditionally from a
      // layout effect that runs on every render is an infinite loop.
      setOffsets((current) => {
        const keys = Object.keys(next);
        const same =
          keys.length === Object.keys(current).length &&
          keys.every((key) => current[key] === next[key]);
        return same ? current : next;
      });
    };

    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [pinned, rows]);

  if (!ipos.length) {
    return (
      <div className="empty">
        No IPO data yet. The scraper fills this in on its next run.
      </div>
    );
  }

  const narrowed = visible.length !== filtered.length;
  // Only the rightmost pinned column casts the edge shadow, so two pinned
  // columns read as one block instead of two stacked panels.
  const lastPinned = COLUMNS.filter((c) => pinned.includes(c.key)).slice(-1)[0];

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
            placeholder="Search IPO, lot size, price…"
            aria-label="Search IPOs by name, symbol, board, lot size or price"
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
      </div>

      {narrowed && visible.length > 0 ? (
        <p className="result-note">
          {visible.length} of {filtered.length} match this filter
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
            {cards.map((ipo) => {
              const timeline = timelineLabel(ipo, today);
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
                      {timeline ? (
                        <span className="days-left" data-urgent={timeline.urgent}>
                          {timeline.text}
                        </span>
                      ) : null}
                    </div>
                  </div>
                  <div className="ipo-card-grid">
                    {/* Merged for the same reason as the table column, and
                        the freed cell takes issue size rather than leaving a
                        hole in the 2x2 grid. */}
                    <Stat label="GMP → Est.">
                      <GmpEstimate ipo={ipo} />
                    </Stat>
                    <Stat label="Price Band">{priceBand(ipo)}</Stat>
                    <Stat label="Issue Size">{fmtIssueSize(ipo)}</Stat>
                    <Stat label="Min Invest">{inr(ipo.min_investment)}</Stat>
                  </div>
                </Link>
              );
            })}
          </div>

          {moreCards ? (
            /* Empty on purpose: the reader scrolling here is the whole
               interaction, and a spinner for work that takes no time would
               only ever be seen as a flicker. */
            <div className="card-more" ref={sentinelRef}>
              {autoGrows ? null : (
                <button
                  type="button"
                  className="link-btn"
                  onClick={() => setShown((count) => count + CARD_CHUNK)}
                >
                  Show {Math.min(CARD_CHUNK, visible.length - cards.length)} more
                </button>
              )}
            </div>
          ) : visible.length > CARD_CHUNK ? (
            <p className="card-end">That&rsquo;s all {visible.length}.</p>
          ) : null}

          {/* Desktop view */}
          <div className="table-wrap">
            <table ref={tableRef}>
              <thead>
                <tr>
                  {COLUMNS.map((column) => (
                    <HeadCell
                      key={column.key}
                      column={column}
                      sort={sort}
                      onSort={selectSort}
                      pinned={pinned.includes(column.key)}
                      pinEdge={lastPinned && lastPinned.key === column.key}
                      left={offsets[column.key] ?? 0}
                      onPin={togglePin}
                    />
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((ipo) => {
                  const timeline = timelineLabel(ipo, today);
                  return (
                    <tr key={ipo.slug}>
                      {COLUMNS.map((column) => {
                        const isPinned = pinned.includes(column.key);
                        return (
                          <td
                            key={column.key}
                            data-col={column.key}
                            data-pinned={isPinned || undefined}
                            data-pin-edge={
                              (lastPinned && lastPinned.key === column.key) || undefined
                            }
                            style={
                              isPinned
                                ? { "--pin-left": `${offsets[column.key] ?? 0}px` }
                                : undefined
                            }
                          >
                            {column.render(ipo, { timeline })}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {pageCount > 1 ? (
            <nav className="pager" aria-label="IPO table pages">
              <button
                type="button"
                className="pager-step"
                onClick={() => goToPage(current - 1)}
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
                        onClick={() => goToPage(entry)}
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
                onClick={() => goToPage(current + 1)}
                disabled={current === pageCount}
                aria-label="Next page"
              >
                <span aria-hidden="true">&rsaquo;</span>
              </button>

              {/* Live, because after a page turn the numbers are the only
                  thing that says where the reader now is. */}
              <p className="pager-range" aria-live="polite">
                {start + 1}&ndash;{start + rows.length} of {visible.length}
              </p>
            </nav>
          ) : null}
        </>
      )}
    </>
  );
}
