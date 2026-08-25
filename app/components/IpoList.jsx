"use client";

/**
 * Dashboard list with status filter tabs.
 *
 * Renders as cards on phones (what the Android app shows) and as a table on
 * desktop — one component, switched by CSS so there is no layout shift and
 * no duplicated data.
 */

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { fmtDate, inr, priceBand, times } from "../../lib/format";
import Sparkline from "./Sparkline";
import { GmpValue, Stat, StatusBadge } from "./ui";

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

const TAB_KEYS = TABS.map((t) => t.key);
const BOARD_KEYS = BOARDS.map((b) => b.key);

const boardOf = (ipo) => (ipo.board || "Mainboard").toLowerCase();

export default function IpoList({ ipos }) {
  const [active, setActive] = useState("all");
  const [board, setBoard] = useState("all");

  // Read ?tab= / ?board= on the client rather than from server searchParams,
  // so the page keeps one cacheable render. This also makes the app-manifest
  // shortcut ("/?tab=open") work and makes filter links shareable.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tab = params.get("tab");
    const requestedBoard = params.get("board");
    if (tab && TAB_KEYS.includes(tab)) setActive(tab);
    if (requestedBoard && BOARD_KEYS.includes(requestedBoard)) setBoard(requestedBoard);
  }, []);

  const setParam = (name, key) => {
    const url = new URL(window.location.href);
    if (key === "all") url.searchParams.delete(name);
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

  const visible = useMemo(
    () => byBoard.filter((i) => active === "all" || i.status === active),
    [byBoard, active]
  );

  if (!ipos.length) {
    return (
      <div className="empty">
        No IPO data yet. The scraper fills this in on its next run.
      </div>
    );
  }

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

      {visible.length === 0 ? (
        <div className="empty">
          No {active === "all" ? "" : `${active} `}
          {board === "all" ? "IPOs" : `${board === "sme" ? "SME" : "Mainboard"} IPOs`} right now.
        </div>
      ) : (
        <>
          {/* Phone / app view */}
          <div className="card-list">
            {visible.map((ipo) => (
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
                  <StatusBadge status={ipo.status} />
                </div>
                <div className="ipo-card-grid">
                  <Stat label="GMP">
                    <GmpValue ipo={ipo} />
                  </Stat>
                  <Stat label="Price Band">{priceBand(ipo)}</Stat>
                  <Stat label="Min Invest">{inr(ipo.min_investment)}</Stat>
                </div>
              </Link>
            ))}
          </div>

          {/* Desktop view */}
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Company</th>
                  <th>Board</th>
                  <th>GMP</th>
                  <th>Trend (3d)</th>
                  <th>Price Band</th>
                  <th>Lot</th>
                  <th>Min Invest</th>
                  <th>Open – Close</th>
                  <th>Subs.</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((ipo) => (
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
                      <Sparkline values={ipo.gmp_spark} />
                    </td>
                    <td>{priceBand(ipo)}</td>
                    <td>{ipo.lot_size ?? "—"}</td>
                    <td>{inr(ipo.min_investment)}</td>
                    <td>
                      {fmtDate(ipo.open_date)} – {fmtDate(ipo.close_date)}
                    </td>
                    <td>{times(ipo.subscription_total)}</td>
                    <td>
                      <StatusBadge status={ipo.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
}
