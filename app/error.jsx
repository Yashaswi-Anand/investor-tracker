"use client";

/**
 * What the reader sees when a page throws in the browser.
 *
 * Without this file Next.js ships its own last resort — a bare line of black
 * text on white reading "Application error: a client-side exception has
 * occurred (see the browser console for more information)". It tells a reader
 * nothing they can act on and looks like the site is gone.
 *
 * THE COMMON CAUSE IS A DEPLOY. Next.js stamps the build's chunk hashes into
 * its HTML, and a deploy replaces those files. Anyone holding the page open
 * across one — or loading it while the upload is still in flight — asks for a
 * chunk the server no longer has. Nothing is wrong with their device or the
 * data; the page they hold is simply from the previous build, and the fix is
 * to fetch the current one.
 *
 * So that case is repaired rather than reported: one automatic reload, once
 * per session. The guard matters more than it looks — if the reload does not
 * fix it, reloading again would put the reader in a loop they cannot leave,
 * which is worse than the error. After the first attempt they get the message
 * and the choice.
 */

import { useEffect, useState } from "react";

const RETRY_KEY = "ipo-chunk-retry";

/** A missing chunk, under the several names browsers give it. */
function looksLikeStaleBuild(error) {
  const text = `${error?.name || ""} ${error?.message || ""}`;
  return (
    /ChunkLoadError/i.test(text) ||
    /Loading chunk .* failed/i.test(text) ||
    /Loading CSS chunk/i.test(text) ||
    /error loading dynamically imported module/i.test(text) ||
    /Importing a module script failed/i.test(text)
  );
}

function readRetried() {
  try {
    return sessionStorage.getItem(RETRY_KEY) === "1";
  } catch {
    // Private mode, or storage disabled. Treat it as "already tried" so the
    // reader lands on the message rather than in a reload loop.
    return true;
  }
}

export default function PageError({ error, reset }) {
  const [recovering, setRecovering] = useState(false);

  useEffect(() => {
    if (!looksLikeStaleBuild(error) || readRetried()) return;
    try {
      sessionStorage.setItem(RETRY_KEY, "1");
    } catch {
      return;
    }
    setRecovering(true);
    // Drop the cached copies of the old build's files on the way out, or the
    // service worker would hand back the same stale assets after the reload.
    const clear = caches?.keys
      ? caches.keys().then((keys) => Promise.all(keys.map((key) => caches.delete(key))))
      : Promise.resolve();
    clear.catch(() => {}).then(() => window.location.reload());
  }, [error]);

  if (recovering) {
    return (
      <div className="container page-pad">
        <section className="card card-wide">
          <h2>Updating…</h2>
          <p className="subtitle subtitle-flush">
            The site was updated while this page was open. Fetching the new
            version.
          </p>
        </section>
      </div>
    );
  }

  return (
    <div className="container page-pad">
      <section className="card card-wide">
        <h2>Something went wrong</h2>
        <p className="subtitle">
          This page failed to load in your browser. The IPO data itself is
          fine — trying again usually clears it.
        </p>
        <div className="error-actions">
          <button type="button" className="error-btn" onClick={() => reset()}>
            Try again
          </button>
          <button
            type="button"
            className="error-btn error-btn-quiet"
            onClick={() => window.location.reload()}
          >
            Reload the page
          </button>
        </div>
      </section>
    </div>
  );
}
