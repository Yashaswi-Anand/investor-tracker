/**
 * The offer documents NSE publishes for an issue, and how to reach them.
 *
 * NSE serves every one of these as a ZIP from its archive, which on a phone
 * is the worst possible shape: tapping "Red Herring Prospectus" downloads an
 * archive most phones cannot open, instead of showing the document. The PDF
 * is inside; the route in app/api/doc pulls it out and serves that.
 *
 * Kinds are named here rather than in the route so the page and the route
 * cannot disagree about which document is which.
 */

export const DOCUMENT_KINDS = {
  rhp: {
    field: "rhp_url",
    label: "Red Herring Prospectus",
    note: "The full offer document",
  },
  ratios: {
    field: "ratios_url",
    label: "Basis of Issue Price",
    note: "How the band was arrived at",
  },
  anchor: {
    field: "anchor_url",
    label: "Anchor Allocation",
    note: "Who was allotted before the issue opened",
  },
};

/** The NSE archive URL for one document, or null when it was never published. */
export function documentUrl(ipo, kind) {
  const spec = DOCUMENT_KINDS[kind];
  if (!spec) return null;
  const url = (ipo?.details || {})[spec.field];
  return typeof url === "string" && url.startsWith("http") ? url : null;
}

/** Every document this issue actually has, in the order they are read in. */
export function documentsFor(ipo) {
  return Object.entries(DOCUMENT_KINDS)
    .map(([kind, spec]) => ({ kind, ...spec, url: documentUrl(ipo, kind) }))
    .filter((doc) => doc.url);
}
