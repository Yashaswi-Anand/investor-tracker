"use client";

import { useEffect } from "react";

/**
 * Registers the service worker.
 *
 * This is what makes the site installable — and installability is a hard
 * requirement for the Android TWA app. It also gives offline support, so the
 * app shows the last-seen IPO list instead of a browser error when the
 * network drops.
 */
export default function ServiceWorker() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    if (process.env.NODE_ENV !== "production") return;

    const register = () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        /* registration failure must never break the page */
      });
    };

    if (document.readyState === "complete") register();
    else window.addEventListener("load", register);

    return () => window.removeEventListener("load", register);
  }, []);

  return null;
}
