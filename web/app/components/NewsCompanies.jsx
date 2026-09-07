"use client";

import Link from "next/link";
import { useState } from "react";

/**
 * The companies in today's headlines, as links to their own pages.
 *
 * Only issues that are OPEN or UPCOMING. A headline about a company that
 * listed three weeks ago is history; a headline about one closing tomorrow
 * is a reason to open the page. The list exists to be acted on, and a
 * reader scanning it for something to apply to should not have to sort the
 * live ones out of a pile of finished ones.
 *
 * The board filter uses the same chips as the main list, because it is the
 * same question asked in a second place and answering it differently here
 * would be a small lie about how the site works.
 */

const BOARDS = [
  { key: "all", label: "All boards" },
  { key: "mainboard", label: "Mainboard" },
  { key: "sme", label: "SME" },
];

export default function NewsCompanies({ companies }) {
  const [board, setBoard] = useState("all");
  if (!companies.length) return null;

  const shown =
    board === "all"
      ? companies
      : companies.filter((c) => (c.board || "mainboard") === board);

  const count = (key) =>
    key === "all"
      ? companies.length
      : companies.filter((c) => (c.board || "mainboard") === key).length;

  return (
    <section className="card card-wide news-companies">
      <h2>Companies in the news</h2>
      <p className="subtitle subtitle-flush">
        Open and upcoming issues mentioned in today&apos;s headlines. Each links
        to that issue&apos;s own page — GMP history, subscription by category,
        timetable and offer documents.
      </p>

      <div className="live-tabs news-company-boards" role="tablist" aria-label="Board">
        {BOARDS.map((item) => (
          <button
            key={item.key}
            type="button"
            role="tab"
            className="tab tab-sm"
            data-active={board === item.key}
            aria-selected={board === item.key}
            /* Disabled rather than hidden when a board has nothing: a filter
               row that changes length as the day goes on is harder to trust
               than one where the empty option says so. */
            disabled={count(item.key) === 0}
            onClick={() => setBoard(item.key)}
          >
            {item.label}
            <span className="news-company-count">{count(item.key)}</span>
          </button>
        ))}
      </div>

      {shown.length > 0 ? (
        <ul className="news-company-list">
          {shown.map((company) => (
            <li key={company.slug}>
              <Link href={`/ipo/${company.slug}`}>
                {company.name}
                <span className="news-company-count">
                  {company.indices.length}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="subtitle subtitle-flush">
          No {board === "sme" ? "SME" : "Mainboard"} issue is in the news today.
        </p>
      )}
    </section>
  );
}
