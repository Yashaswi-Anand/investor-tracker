/**
 * The live quote and today's five-minute candles for one listed symbol.
 *
 * Called by LiveChart from the reader's browser; this is the only thing on
 * the site that a browser fetches after the page loads, and it fetches it
 * from us, not from NSE. NSE is asked from here, server-side, so a reader's
 * IP, cookies and device never reach the exchange — which keeps the privacy
 * policy's "our data sources never see you" true after this ships.
 *
 * CACHED IN MEMORY, BRIEFLY. One answer per symbol is reused for thirty
 * seconds while the market trades and five minutes when it does not.
 * Whatever the traffic, NSE hears from us at most twice a minute per
 * symbol; and a page reloaded three times in a row does not cost them
 * three round trips. The cache is per process and evaporates on restart,
 * which is fine — it exists to be polite, not to be durable.
 *
 * NEVER A 500. Every failure — NSE down, a symbol they do not know, a
 * stale session — returns 200 with ok:false and a reason. The daily chart
 * under the live one is server-rendered from our own database and does not
 * need NSE at all; a dead quote must not take that page down with it.
 */

import { NSE } from "../../../../lib/config";
import { getAllIpos } from "../../../../lib/data";
import { fetchLive, marketPhase } from "../../../../lib/nse";

export const dynamic = "force-dynamic";

const cache = new Map();

/** Only symbols we list may be asked for — this is not a general quote API. */
async function knownIpo(symbol) {
  const wanted = String(symbol || "").toUpperCase();
  if (!/^[A-Z0-9&-]{1,20}$/.test(wanted)) return null;
  const ipos = await getAllIpos();
  return ipos.find((ipo) => String(ipo.symbol || "").toUpperCase() === wanted) || null;
}

export async function GET(request, { params }) {
  const { symbol: raw } = await params;
  const ipo = await knownIpo(raw);
  if (!ipo) {
    return Response.json({ ok: false, reason: "unknown-symbol" }, { status: 404 });
  }
  if (ipo.status !== "listed") {
    return Response.json({ ok: false, reason: "not-listed" });
  }

  const symbol = String(ipo.symbol).toUpperCase();
  const phase = marketPhase();
  const trading = phase === "open" || phase === "pre-open";
  const ttl = (trading ? NSE.cacheOpenSeconds : NSE.cacheClosedSeconds) * 1000;

  const hit = cache.get(symbol);
  if (hit && Date.now() - hit.at < ttl) {
    return Response.json({ ...hit.body, phase, cached: true }, { headers: noStore });
  }

  try {
    const live = await fetchLive(symbol, ipo.board);
    const body = {
      ok: true,
      ...live,
      fetchedAt: new Date().toISOString(),
    };
    cache.set(symbol, { at: Date.now(), body });
    return Response.json({ ...body, phase, cached: false }, { headers: noStore });
  } catch (error) {
    // A stale-but-real answer beats an honest blank: if NSE has just gone
    // quiet, keep showing the last figure and say when it was from.
    if (hit) {
      return Response.json(
        { ...hit.body, phase, cached: true, stale: true },
        { headers: noStore }
      );
    }
    return Response.json(
      { ok: false, reason: "upstream", detail: String(error?.message || error), phase },
      { headers: noStore }
    );
  }
}

// The browser must ask us every time; the reuse happens in our cache, where
// the age is known, not in the reader's, where it would not be.
const noStore = { "Cache-Control": "no-store" };
