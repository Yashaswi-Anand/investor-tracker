"use client";

/**
 * Best premium among open issues and among upcoming ones, for one board.
 *
 * Mainboard and SME are different propositions — different lot sizes,
 * different money at risk — so a single "top GMP" across both mostly reports
 * whichever board happens to be running hotter that week. The toggle keeps
 * them separate; Mainboard leads because it is what most readers arrive for.
 *
 * Ranked by GMP as a PERCENTAGE of the price band, not by rupees: ₹60 on a
 * ₹120 issue is a different proposition from ₹60 on a ₹900 one, and ranking
 * by the rupee figure would hand the top spot to the most expensive issue
 * every time.
 */

import Link from "next/link";
import { useState } from "react";

const BOARDS = [
  { key: "mainboard", label: "Mainboard" },
  { key: "sme", label: "SME" },
];

const STAGES = [
  ["Open", "open"],
  ["Upcoming", "upcoming"],
];

const boardOf = (ipo) => (ipo.board || "Mainboard").toLowerCase();

const pct = (ipo) =>
  ipo.gmp != null && ipo.price_band_high
    ? (Number(ipo.gmp) / Number(ipo.price_band_high)) * 100
    : null;

function best(ipos, board, status) {
  const candidates = ipos.filter(
    (i) => boardOf(i) === board && i.status === status && pct(i) != null
  );
  if (!candidates.length) return null;
  return candidates.reduce((top, i) => (pct(i) > pct(top) ? i : top));
}

export default function TopGmp({ ipos }) {
  const [board, setBoard] = useState("mainboard");

  return (
    <div className="stat-tile stat-tile-wide">
      <div className="top-gmp-head">
        <div className="k">Top GMP (% of price)</div>
        <div className="top-gmp-boards" role="tablist" aria-label="Board">
          {BOARDS.map((item) => (
            <button
              key={item.key}
              type="button"
              role="tab"
              className="board-chip"
              data-active={board === item.key}
              aria-selected={board === item.key}
              onClick={() => setBoard(item.key)}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <div className="top-gmp">
        {STAGES.map(([label, status]) => {
          const ipo = best(ipos, board, status);
          return ipo ? (
            <Link
              key={status}
              href={`/ipo/${ipo.slug}`}
              className="top-gmp-row"
              title={`${ipo.name} — GMP ₹${ipo.gmp} on ₹${ipo.price_band_high}`}
            >
              <span className="top-gmp-label">{label}</span>
              <span className="top-gmp-name">{ipo.short_name || ipo.name}</span>
              <span className="top-gmp-pct num">
                {pct(ipo) > 0 ? "+" : ""}
                {pct(ipo).toFixed(0)}%
              </span>
            </Link>
          ) : (
            <div key={status} className="top-gmp-row" data-empty="true">
              <span className="top-gmp-label">{label}</span>
              <span className="top-gmp-name">No premium yet</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
