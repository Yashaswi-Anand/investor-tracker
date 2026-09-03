"use client";

/**
 * The header menu.
 *
 * The site has four places to be and no room in a phone header for four
 * links beside a wordmark and a theme toggle. News keeps its own button on a
 * wide screen because it is the one people come back for; everything else,
 * and News on a phone, lives behind this. Contact is a footer link rather
 * than a fifth item here — it is looked for once, not returned to.
 *
 * Deliberately not a modal. None of these is destructive, and a scrim plus a
 * slide-up sheet for a list of links would be ceremony for something that
 * should feel like a tap.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

const ITEMS = [
  {
    href: "/",
    label: "All IPOs",
    note: "GMP, subscription and dates",
    icon: (
      <path
        d="M4 6h16M4 12h16M4 18h10"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    ),
  },
  {
    href: "/news",
    label: "IPO News",
    note: "Headlines through the day",
    icon: (
      <path
        d="M4 5.5h11a1 1 0 0 1 1 1v11a1.5 1.5 0 0 0 1.5 1.5H6a2 2 0 0 1-2-2v-11Zm12 3h2.5A1.5 1.5 0 0 1 20 10v7.5a1.5 1.5 0 0 1-3 0M7 9h5M7 12.5h5M7 16h3"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    ),
  },
  {
    href: "/about",
    label: "About",
    note: "Where the numbers come from",
    icon: (
      <path
        d="M12 16v-4.5M12 8.2h.01M12 3.5a8.5 8.5 0 1 1 0 17 8.5 8.5 0 0 1 0-17Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    ),
  },
]

// Check allotment is deliberately absent. The page still works for anyone
// holding its link, but it is not offered: it cannot answer the question its
// name asks — every registrar puts that behind a CAPTCHA — and a menu item
// promising an answer the page then refuses is the wrong first impression,
// especially on a site about to be reviewed by an ad network. Put it back by
// restoring the entry here and the /allotment line in sitemap.js.;

export default function SiteMenu() {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const pathname = usePathname();

  // Navigating is the end of the menu's job. Without this it survives a
  // client-side route change and sits open over the page it just opened.
  useEffect(() => setOpen(false), [pathname]);

  useEffect(() => {
    if (!open) return undefined;
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

  return (
    <div className="site-menu" ref={rootRef}>
      <button
        type="button"
        className="menu-button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={open ? "Close menu" : "Open menu"}
        onClick={() => setOpen((v) => !v)}
      >
        <svg viewBox="0 0 24 24" width="19" height="19" aria-hidden="true">
          {open ? (
            <path
              d="M6 6l12 12M18 6 6 18"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
          ) : (
            <path
              d="M4 7h16M4 12h16M4 17h16"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
          )}
        </svg>
      </button>

      {open && (
        <nav className="menu-pop" aria-label="Site sections">
          {ITEMS.map((item) => {
            const active =
              item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className="menu-item"
                data-active={active || undefined}
                aria-current={active ? "page" : undefined}
              >
                <svg viewBox="0 0 24 24" width="19" height="19" aria-hidden="true">
                  {item.icon}
                </svg>
                <span className="menu-item-text">
                  <span className="menu-item-label">{item.label}</span>
                  <span className="menu-item-note">{item.note}</span>
                </span>
              </Link>
            );
          })}
        </nav>
      )}
    </div>
  );
}
