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
import { GmpValue, Stat, StatusBadge } from "./ui";

const TABS = [
  { key: "all", label: "All" },
  { key: "open", label: "Open" },
  { key: "upcoming", label: "Upcoming" },
  { key: "closed", label: "Closed" },
  { key: "listed", label: "Listed" },
];

const TAB_KEYS = TABS.map((t) => t.key);

export default function IpoList({ ipos }) {
  const [active, setActive] = useState("all");

  // Read ?tab= on the client rather than from server searchParams, so the
  // page stays statically rendered for SEO. This is what makes the app
  // manifest shortcut ("/?tab=open") work and makes tab links shareable.
  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get("tab");
    if (requested && TAB_KEYS.includes(requested)) setActive(requested);
  }, []);

  const selectTab = (key) => {
    setActive(key);
    const url = new URL(window.location.href);
    if (key === "all") url.searchParams.delete("tab");
    else url.searchParams.set("tab", key);
    window.history.replaceState(null, "", url);
  };

  const counts = useMemo(() => {
    const map = { all: ipos.length };
    for (const ipo of ipos) {
      map[ipo.status] = (map[ipo.status] || 0) + 1;
    }
    return map;
  }, [ipos]);

  const visible = useMemo(
    () => (active === "all" ? ipos : ipos.filter((i) => i.status === active)),
    [ipos, active]
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
      <div className="tabs" role="tablist">
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

      {visible.length === 0 ? (
        <div className="empty">No {active} IPOs right now.</div>
      ) : (
        <>
          {/* Phone / app view */}
          <div className="card-list">
            {visible.map((ipo) => (
              <Link key={ipo.slug} href={`/ipo/${ipo.slug}`} className="ipo-card">
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
