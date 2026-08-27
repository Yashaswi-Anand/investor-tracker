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
      // updateViaCache "none" is not a nicety here. Hostinger's proxy drops
      // the Cache-Control header we set on /sw.js in next.config.mjs — the
      // response arrives with none at all — so the browser is free to apply
      // heuristic caching and hand back a worker we replaced hours ago. That
      // matters more than usual for this file: a broken service worker keeps
      // serving readers a broken site until it is replaced, and it is the one
      // thing on the site that cannot be fixed by shipping new HTML.
      //
      // The explicit update() is the same argument once more. Registering an
      // already-registered worker is a no-op, so without it a reader who
      // installed the old one would wait for whenever the browser next felt
      // like checking.
      navigator.serviceWorker
        .register("/sw.js", { updateViaCache: "none" })
        .then((registration) => registration.update())
        .catch(() => {
          /* registration failure must never break the page */
        });
    };

    if (document.readyState === "complete") register();
    else window.addEventListener("load", register);

    return () => window.removeEventListener("load", register);
  }, []);

  return null;
}
