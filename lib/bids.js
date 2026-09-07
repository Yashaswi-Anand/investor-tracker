/**
 * How much an application costs, and who is allowed to make it.
 *
 * SEBI splits an Indian book by the RUPEE VALUE of the bid, not by who is
 * bidding: up to two lakh is retail, two to ten lakh is small-HNI, above ten
 * lakh is big-HNI. Applicants care about the boundaries because a bid one
 * lot over the retail line stops competing in the retail lottery — where
 * allotment is by draw and a small application is as good as a large one —
 * and starts competing in a proportionate pool where it is not.
 *
 * Nothing here needs a new source. The ladder is arithmetic over the lot
 * size and the top of the price band, both of which we already store; the
 * thresholds are the regulator's, fixed, and stated below so a reader can
 * check the sum rather than trust it.
 */

/** SEBI's bid-value bands, in rupees. */
export const RETAIL_CAP = 200000;
export const SHNI_CAP = 1000000;

/**
 * The lot ladder: the cheapest and dearest application in each category.
 *
 * Priced at the TOP of the band, which is what an applicant actually pays
 * at cut-off and what the exchange uses to police the limits. Pricing at
 * the floor would put a bid over the line that the floor kept under it.
 *
 * Returns [] when we do not hold a lot size or a band — better an absent
 * table than one built on a guess about either.
 */
export function lotLadder(ipo) {
  const lot = Number(ipo?.lot_size);
  const price = Number(ipo?.price_band_high);
  if (!Number.isFinite(lot) || !Number.isFinite(price) || lot <= 0 || price <= 0) {
    return [];
  }

  const perLot = lot * price;
  // The ladder starts at ONE lot, the smallest bid the exchange will take,
  // and not at the site's headline minimum — on an SME issue that is two
  // lots, which at these lot values costs more than the retail cap, so
  // flooring here labelled a ₹2.54 lakh application "Retail (min)" on an
  // issue whose retail ceiling is ₹2 lakh. Reading every rung straight off
  // the caps makes the two agree: the SME two-lot minimum turns out to BE
  // the S-HNI rung, which is the reason it is two.
  const under = (cap) => Math.floor(cap / perLot);
  const row = (label, lots, note) =>
    lots > 0
      ? { label, lots, shares: lots * lot, amount: lots * perLot, note }
      : null;

  const retailMax = under(RETAIL_CAP);
  const shniMax = under(SHNI_CAP);

  const rows = [
    row("Retail (min)", 1, "one lot, the smallest bid allowed"),
    row("Retail (max)", retailMax, "most that stays under ₹2L"),
    row("S-HNI (min)", retailMax + 1, "first bid over ₹2L"),
    row("S-HNI (max)", shniMax, "most that stays under ₹10L"),
    row("B-HNI (min)", shniMax + 1, "first bid over ₹10L"),
  ].filter(Boolean);

  // Deduplicate by lot count: on a very expensive lot, "first bid over ₹2L"
  // and "first bid over ₹10L" can land on the same application, and printing
  // it twice would suggest two different rungs where there is one.
  const seen = new Set();
  return rows.filter((r) => !seen.has(r.lots) && seen.add(r.lots));
}

/** Category rows NSE published, with the share of the book each was given. */
export function categoryRows(details) {
  const rows = (details || {}).category_bids || [];
  if (!Array.isArray(rows) || !rows.length) return [];

  const applications = new Map(
    ((details || {}).applications || []).map((a) => [a.key, a.applications])
  );
  // The sub-rows of NII already sit inside the NII total, so a percentage
  // taken against their sum would count that book twice.
  const base = rows
    .filter((r) => !r.key.startsWith("nii_"))
    .reduce((sum, r) => sum + (r.offered || 0), 0);

  return rows.map((r) => ({
    ...r,
    nested: r.key.startsWith("nii_"),
    pct: base && r.offered ? (r.offered / base) * 100 : null,
    applications: applications.get(r.key) ?? null,
  }));
}

/**
 * Application counts alone, for an issue whose category table NSE has not
 * filled in — which is most SME issues, where bidDetails arrives long before
 * ipo-active-category carries anything.
 */
export function applicationRows(details) {
  const rows = (details || {}).applications || [];
  return Array.isArray(rows) ? rows : [];
}
