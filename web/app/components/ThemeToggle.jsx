"use client";

import { useEffect, useState } from "react";

const STORAGE_KEY = "theme";
const LIGHT_BAR = "#4f46e5";
const DARK_BAR = "#0a0e1a";

/** Resolve the effective theme: explicit choice, else the OS preference. */
function currentTheme() {
  const explicit = document.documentElement.dataset.theme;
  if (explicit === "light" || explicit === "dark") return explicit;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", theme === "dark" ? DARK_BAR : LIGHT_BAR);
}

/**
 * Light / dark switch.
 *
 * The initial theme is applied by an inline script in layout.jsx BEFORE
 * hydration (so there is no flash); this component only reflects and
 * changes it. The choice persists in localStorage; with nothing stored the
 * site follows the OS setting.
 */
export default function ThemeToggle() {
  const [theme, setTheme] = useState(null); // null until mounted (SSR-safe)

  useEffect(() => {
    setTheme(currentTheme());
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      // Only follow the OS while the user has not picked explicitly.
      if (!localStorage.getItem(STORAGE_KEY)) setTheme(currentTheme());
    };
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  const toggle = () => {
    const next = theme === "dark" ? "light" : "dark";
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* private mode — still switch for this page view */
    }
    applyTheme(next);
    setTheme(next);
  };

  const isDark = theme === "dark";

  return (
    <button
      type="button"
      className="theme-toggle"
      onClick={toggle}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      title={isDark ? "Light mode" : "Dark mode"}
    >
      {isDark ? (
        /* sun */
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
        </svg>
      ) : (
        /* moon */
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
        </svg>
      )}
    </button>
  );
}
