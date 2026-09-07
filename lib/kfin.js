/**
 * Asking KFin, from the reader's own browser.
 *
 * This is the request KFin's own allotment page makes when you press Submit
 * there: a GET to their API with the PAN and the issue id in two headers.
 * Their API answers any origin — Access-Control-Allow-Origin: * on the
 * preflight, both headers whitelisted — and there is no CAPTCHA anywhere in
 * their page, so nothing is worked around here. The request leaves the
 * browser for KFin and the answer comes straight back; this site's server
 * is not on the path and never sees the PAN.
 *
 * The endpoint and the issue id both come from the scraper, which reads them
 * off KFin's public page every run, so a KFin deploy that moves either is
 * picked up rather than breaking this. Nothing is retried on a 429: their
 * limit is theirs to set and a page that hammers through it is the reason
 * such limits exist.
 */

const PAN = /^[A-Z]{5}[0-9]{4}[A-Z]$/;

function num(value) {
  const n = parseInt(String(value ?? "").replace(/[^0-9-]/g, ""), 10);
  return Number.isFinite(n) ? n : 0;
}

/**
 * KFin returns one record per application under the PAN: the applicant's
 * name as the bank has it, the application number, shares applied for and
 * shares allotted, and the category. A PAN with two applications in one
 * issue (two demat accounts) gets two records.
 */
function normalise(record) {
  return {
    name: String(record.Name ?? record.name ?? "").trim() || null,
    application: String(record.Appln_No ?? record.appln_no ?? "").trim() || null,
    applied: num(record.App_Shares ?? record.app_shares),
    allotted: num(record.All_Shares ?? record.all_shares),
    category: String(record.category ?? record.Category ?? "").trim() || null,
  };
}

/**
 * @returns {{state: "allotted"|"applied"|"none"|"limited"|"error", rows: Array, status?: number}}
 *   allotted — at least one application received shares
 *   applied  — found, but nothing allotted (KFin's own page shows this as
 *              "Not allotted")
 *   none     — KFin has no application under this PAN for this issue, which
 *              is also what it says before the data is loaded
 *   limited  — KFin is rate-limiting; wait and try again, do not retry
 *   error    — anything else, including a network failure
 */
export async function lookupKfin({ endpoint, clientId, pan }) {
  const value = String(pan || "").toUpperCase();
  if (!endpoint || !clientId || !PAN.test(value)) {
    return { state: "error", rows: [] };
  }

  let res;
  try {
    res = await fetch(`${endpoint}pan`, {
      method: "GET",
      headers: { reqparam: value, client_id: String(clientId) },
      // Nothing about this request should be remembered by the browser: the
      // answer changes as KFin loads data, and the PAN is in a header.
      cache: "no-store",
    });
  } catch {
    return { state: "error", rows: [] };
  }

  if (res.status === 404) return { state: "none", rows: [] };
  if (res.status === 429) return { state: "limited", rows: [] };
  if (!res.ok) return { state: "error", rows: [], status: res.status };

  let body;
  try {
    body = await res.json();
  } catch {
    return { state: "error", rows: [], status: res.status };
  }

  const list = Array.isArray(body)
    ? body
    : Array.isArray(body?.data)
      ? body.data
      : Array.isArray(body?.data?.data)
        ? body.data.data
        : [];
  const rows = list
    .filter((r) => r && typeof r === "object")
    .map(normalise);

  if (!rows.length) return { state: "none", rows: [] };
  const allotted = rows.some((r) => r.allotted > 0);
  return { state: allotted ? "allotted" : "applied", rows };
}
