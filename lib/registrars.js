/**
 * The registrars, as a fixed set rather than as whatever string NSE published.
 *
 * The same company arrives four ways — "KFin Technologies Limited", "Kfintech
 * Technologies Limited", "KFIN Technologies Limited", "Kfin Technologies
 * Ltd." — and a page that groups by the raw string shows one registrar four
 * times. Everything the allotment page needs to know about a registrar is a
 * property of the registrar, not of the issue: where its lookup lives, what
 * it asks for, what it puts in the way. So it is keyed here once.
 *
 * `portal` is the page a reader lands on. It is deliberately the same for
 * every issue at that registrar: none of them accepts a query string that
 * preselects the company (Skyline's ?app= redirects straight back to its
 * list), so a per-issue URL would be a fiction.
 *
 * `steps` is what to do on their page, in their words, from a read of each
 * form on 7 September 2026. `direct` marks the one registrar whose lookup a
 * browser can make for itself — see lib/kfin.js for why that is only KFin.
 * `mark` is two letters for the badge: registrars publish no usable logo, and
 * a monogram in the brand tint identifies one across the picker and the card
 * faster than reading the name twice.
 */

export const REGISTRARS = {
  kfin: {
    key: "kfin",
    name: "KFin Technologies",
    short: "KFin",
    mark: "KF",
    portal: "https://ipostatus.kfintech.com/",
    hosts: ["kfintech.com"],
    match: ["kfin", "karvy"],
    direct: true,
    steps: [
      "Pick the IPO in “Select IPO”",
      "Leave “PAN” selected",
      "Paste the PAN and press Submit",
    ],
  },
  bigshare: {
    key: "bigshare",
    name: "Bigshare Services",
    short: "Bigshare",
    mark: "BS",
    portal: "https://ipo.bigshareonline.com/IPO_Status.html",
    hosts: ["bigshareonline.com"],
    match: ["bigshare"],
    direct: false,
    steps: [
      "Pick the company in “Select Company”",
      "Set “Selection Type” to PAN",
      "Paste the PAN, type the CAPTCHA, press Search",
    ],
  },
  mufg: {
    key: "mufg",
    name: "MUFG Intime India",
    short: "MUFG Intime",
    mark: "MU",
    portal: "https://in.mpms.mufg.com/Initial_Offer/public-issues.html",
    hosts: ["mpms.mufg.com", "linkintime.co.in"],
    // Link Intime until 2025; older issue pages still say so.
    match: ["mufg", "intime", "link intime", "linkintime"],
    direct: false,
    steps: [
      "Pick the company in “Select Company”",
      "Choose the PAN option",
      "Paste the PAN and press Submit",
    ],
  },
  skyline: {
    key: "skyline",
    name: "Skyline Financial Services",
    short: "Skyline",
    mark: "SK",
    portal: "https://www.skylinerta.com/ipo.php",
    hosts: ["skylinerta.com"],
    match: ["skyline"],
    direct: false,
    steps: [
      "Pick the company — their page moves on by itself",
      "Paste the PAN into “Pan of Investor” and press Search",
    ],
  },
  cameo: {
    key: "cameo",
    name: "Cameo Corporate Services",
    short: "Cameo",
    mark: "CA",
    portal: "https://ipostatus1.cameoindia.com/",
    hosts: ["cameoindia.com"],
    match: ["cameo"],
    direct: false,
    steps: GENERIC_STEPS(),
  },
  maashitla: {
    key: "maashitla",
    name: "Maashitla Securities",
    short: "Maashitla",
    mark: "MA",
    portal: "https://maashitla.com/allotment-status/public-issues",
    hosts: ["maashitla.com"],
    match: ["maashitla"],
    direct: false,
    steps: GENERIC_STEPS(),
  },
  purva: {
    key: "purva",
    name: "Purva Sharegistry",
    short: "Purva",
    mark: "PU",
    portal: "https://www.purvashare.com/investor-service/ipo-query",
    hosts: ["purvashare.com"],
    match: ["purva"],
    direct: false,
    steps: GENERIC_STEPS(),
  },
};

/**
 * The exchange's own bid verification — a second route, not a registrar.
 *
 * NSE will answer for a PAN alone, which is why it is worth offering at all;
 * every issue this site tracks comes from NSE's API, so every one of them is
 * on the exchange. What it verifies is the BID as the member or bank filed it
 * — accepted, blocked amount, and allotted quantity once that exists — so it
 * answers a different question from the registrar and can be useful even for
 * a KFin issue the page already checks live.
 *
 * Two honest limits, both from reading their page on 26 October 2026:
 *
 *   1. It only knows bids ROUTED THROUGH NSE. A bid your broker sent to BSE
 *      is not there, and their page answers "This Application is not Bided /
 *      Processed from NSE", which reads like a verdict and is not one. The
 *      copy beside the link has to say so or it will be misread as "not
 *      allotted".
 *   2. It cannot be deep-linked. verify-ipo-bids.js reads no URL parameters,
 *      so the symbol cannot be preselected the way it cannot be for any
 *      registrar either — see the note on `portal` above.
 *
 * This site does not call their API. The lookup is wrapped in reCAPTCHA v3
 * (`grecaptcha.execute(...)` then `body.recaptcha = token`) and the response
 * carries the applicant's beneficiary ID, depository ID and UPI blocked
 * amount. Proxying it would mean producing a token for a domain that is not
 * ours, and turning a PAN into a stranger's demat identifiers. The reader
 * goes to NSE and NSE's own anti-abuse check runs where it belongs.
 */
export const NSE_BID_CHECK = {
  name: "NSE",
  portal: "https://www.nseindia.com/invest/check-trades-bids-verify-ipo-bids",
};

function GENERIC_STEPS() {
  return [
    "Pick the company",
    "Paste the PAN",
    "Answer their CAPTCHA and search",
  ];
}

/**
 * The registrar an issue belongs to, from whatever the row holds.
 *
 * The URL is tried first because it is the more reliable of the two: the
 * scraper reads it out of an anchor, and an anchor's host does not get
 * respelled the way a company name does. The name is the fallback. An issue
 * whose registrar matches nothing here still gets a record — name and URL
 * as published, no key — so the page can show what it knows rather than
 * pretend the registrar does not exist.
 */
export function registrarFor(ipo) {
  const url = String(ipo?.registrar_url || "");
  const name = String(ipo?.registrar || "");

  let host = "";
  try {
    host = url ? new URL(url).hostname.toLowerCase() : "";
  } catch {
    host = "";
  }

  for (const reg of Object.values(REGISTRARS)) {
    if (host && reg.hosts.some((h) => host === h || host.endsWith(`.${h}`))) {
      return reg;
    }
  }

  const lower = name.toLowerCase();
  for (const reg of Object.values(REGISTRARS)) {
    if (reg.match.some((needle) => lower.includes(needle))) return reg;
  }

  if (!name && !url) return null;
  return {
    key: null,
    name: name || host || "Registrar",
    short: name || host || "Registrar",
    mark: (name || host || "?").replace(/[^A-Za-z]/g, "").slice(0, 2).toUpperCase() || "?",
    portal: url || null,
    hosts: [],
    match: [],
    direct: false,
    steps: GENERIC_STEPS(),
  };
}
