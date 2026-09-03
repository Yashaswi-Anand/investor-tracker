/**
 * The PDF inside NSE's ZIP, served as a PDF.
 *
 * NSE publishes every offer document as a ZIP. On a desktop that is merely
 * inconvenient; on a phone — which is where most of this site is read — a
 * downloaded .zip is a dead end, because Android has no built-in way to open
 * one and the reader is left with a file they cannot read. That was the
 * feedback: "it downloads a zip". So this fetches the archive, takes the PDF
 * out, and hands that back with Content-Disposition: inline, which is what
 * makes a browser show a document rather than save it.
 *
 * IT ALWAYS DEGRADES TO THE ZIP. Every failure path — NSE unreachable, the
 * archive too large, no PDF inside, a corrupt file — redirects to NSE's own
 * URL, which is exactly what the link did before this route existed. The
 * reader is never worse off than they were; at worst they are back where
 * they started.
 *
 * Nothing is stored. The archive is unpacked in memory and the response is
 * cached by the reader's browser, not by us.
 */

import { unzipSync } from "fflate";
import { getIpoBySlug } from "../../../../../lib/data";
import { DOCUMENT_KINDS, documentUrl } from "../../../../../lib/documents";

export const dynamic = "force-dynamic";

/**
 * Past this the archive is not worth pulling through our server — a
 * prospectus runs to a few megabytes, and anything an order of magnitude
 * larger is more likely a mistake than a document someone wants inline.
 */
const MAX_BYTES = 48 * 1024 * 1024;

/** NSE's archive is slow at the best of times; this is generous, not eager. */
const TIMEOUT_MS = 25000;

/** Offer documents never change once filed, so this can be cached hard. */
const CACHE = "public, max-age=86400, stale-while-revalidate=604800";

const handOver = (url) =>
  Response.redirect(url, 302);

/** The document inside the archive: the only PDF, or the largest of several. */
function findPdf(files) {
  const pdfs = Object.entries(files).filter(([name]) =>
    name.toLowerCase().endsWith(".pdf")
  );
  if (!pdfs.length) return null;
  // Some archives carry the prospectus plus a covering letter or an
  // addendum. The document someone asked for is the substantial one.
  pdfs.sort((a, b) => b[1].length - a[1].length);
  return { name: pdfs[0][0], bytes: pdfs[0][1] };
}

export async function GET(request, { params }) {
  const { slug, kind } = await params;

  if (!DOCUMENT_KINDS[kind]) {
    return new Response("Unknown document", { status: 404 });
  }

  const ipo = await getIpoBySlug(slug);
  const source = documentUrl(ipo, kind);
  if (!source) {
    return new Response("No such document for this issue", { status: 404 });
  }

  // A URL NSE never gave us is not one we will fetch. details comes from the
  // scraper, but this route turns it into an outbound request, and an
  // outbound request built from stored data is worth pinning to its host.
  let host;
  try {
    host = new URL(source).hostname;
  } catch {
    return new Response("Malformed document URL", { status: 502 });
  }
  if (!/(^|\.)nseindia\.com$/.test(host)) {
    return new Response("Document is not on NSE's archive", { status: 502 });
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const upstream = await fetch(source, {
      signal: controller.signal,
      headers: {
        // NSE's archive turns away clients that do not look like a browser
        // arriving from its own site.
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36",
        Accept: "application/zip,application/octet-stream,*/*",
        Referer: "https://www.nseindia.com/",
      },
      // An offer document is immutable once filed, so asking NSE for it again
      // on every page view would be taking from them for nothing. A week is
      // longer than any of these ever change in. Next declines to cache a
      // body past its own size limit, and a prospectus is well past it — so
      // in practice the small documents are cached and the large one is not,
      // which is the right way round anyway.
      next: { revalidate: 604800 },
    });
    if (!upstream.ok) return handOver(source);

    const declared = Number(upstream.headers.get("content-length") || 0);
    if (declared > MAX_BYTES) return handOver(source);

    const archive = new Uint8Array(await upstream.arrayBuffer());
    if (archive.length > MAX_BYTES) return handOver(source);

    const pdf = findPdf(unzipSync(archive));
    if (!pdf) return handOver(source);

    // A filename the browser can show in its title bar and use if the reader
    // does choose to save it.
    const filename = `${slug}-${kind}.pdf`;
    return new Response(pdf.bytes, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Length": String(pdf.bytes.length),
        "Content-Disposition": `inline; filename="${filename}"`,
        "Cache-Control": CACHE,
        // The bytes came from NSE and are shown in the browser's own PDF
        // viewer; nothing here should be able to run as a page on our origin.
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "sandbox; default-src 'none'",
      },
    });
  } catch {
    // Aborted, refused, unreachable, or not a ZIP at all.
    return handOver(source);
  } finally {
    clearTimeout(timer);
  }
}
