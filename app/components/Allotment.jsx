"use client";

/**
 * The interactive half of the allotment page: PANs, and what each issue's
 * registrar says about them.
 *
 * SPLIT SO THAT ONLY THE PAN-DEPENDENT ROWS WAIT FOR THE BROWSER. The
 * previous version was one client component that rendered nothing until
 * localStorage had been read, which left a crawler holding a page whose only
 * heading said the site could not look anything up. Now the provider holds
 * the PANs, PanBox collects them, IssuePicker renders the chosen issue — its
 * heading, registrar and steps come out in the server HTML for the default
 * choice — and IssueRows fills in the rows once the PANs are known.
 *
 * WHERE THE PANs LIVE. This browser, and nowhere else on this site. A PAN is
 * a government identifier: it is never sent to our server — no request here
 * goes there — and never put in a URL. The ONE request that carries it goes
 * from this browser straight to KFin's allotment API, for issues KFin
 * handles, because KFin's page makes exactly that request itself and their
 * API accepts it from any origin (see lib/kfin.js). Every other registrar
 * puts the answer behind a CAPTCHA, and there the last step stays the
 * reader's: open their page, paste, answer, and record what it said.
 */

import Link from "next/link";
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { fmtDate } from "../../lib/format";
import { lookupKfin } from "../../lib/kfin";

const PAN_KEY = "ipo-pans";
const MARK_KEY = "ipo-allotment-marks";
const RESULT_KEY = "ipo-allotment-results";
// Written by the version of this page that had an issue picker. Removed on
// load rather than left behind: the privacy policy lists what is stored, and
// a key it no longer names should not exist.
const LEGACY_KEYS = ["ipo-allotment-picks"];

/** Five letters, four digits, one letter — the format the registrars want. */
const PAN_SHAPE = /^[A-Z]{5}[0-9]{4}[A-Z]$/;

/** Between two direct lookups in a batch. KFin rate-limits; this is courtesy. */
const BATCH_GAP_MS = 1500;

/**
 * What a reader can record after looking, as a dropdown rather than a pair of
 * buttons. Two buttons labelled "Allotted" and "Not allotted" sitting in a
 * results table read as the site's own verdict — one reader took an unpressed
 * pair for "not allotted" and reported the page as wrong. A select is
 * unmistakably a thing you set.
 */
const OUTCOMES = [
  { key: "", label: "Not checked yet" },
  { key: "allotted", label: "Allotted" },
  { key: "none", label: "Not allotted" },
];

/** localStorage throws in some privacy modes; a filter tool is not worth it. */
function read(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const value = JSON.parse(raw);
    return value ?? fallback;
  } catch {
    return fallback;
  }
}

function write(key, value) {
  try {
    // An empty list is not a value worth keeping — the key is removed instead
    // of being set to "[]". Erase everything then really does leave nothing
    // behind, which is what the privacy policy says it does.
    const empty =
      value == null ||
      (Array.isArray(value) && value.length === 0) ||
      (typeof value === "object" && !Array.isArray(value) && !Object.keys(value).length);
    if (empty) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* full, or disabled — the page still works for this session */
  }
}

function remove(key) {
  try {
    localStorage.removeItem(key);
  } catch {
    /* nothing stored means nothing to remove */
  }
}

const Allotment = createContext(null);

function useAllotment() {
  const value = useContext(Allotment);
  if (!value) throw new Error("useAllotment outside AllotmentProvider");
  return value;
}

export function AllotmentProvider({ children }) {
  const [pans, setPans] = useState([]);
  const [marks, setMarks] = useState({});
  const [results, setResults] = useState({});
  // Nothing is read from storage during render: the server has no
  // localStorage, and a first client render that disagreed with the server's
  // would be a hydration mismatch.
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setPans(read(PAN_KEY, []));
    setMarks(read(MARK_KEY, {}));
    setResults(read(RESULT_KEY, {}));
    for (const key of LEGACY_KEYS) remove(key);
    setReady(true);
  }, []);

  // Persisted by watching the state rather than by writing alongside every
  // setter: two taps in the same tick both read the state as React last
  // rendered it, and a setter that wrote from `pans` rather than from the
  // value React hands it dropped one of them. The `ready` guard keeps the
  // empty initial state from being written over what is stored before the
  // load runs.
  useEffect(() => {
    if (ready) write(PAN_KEY, pans);
  }, [ready, pans]);
  useEffect(() => {
    if (ready) write(MARK_KEY, marks);
  }, [ready, marks]);
  useEffect(() => {
    if (ready) write(RESULT_KEY, results);
  }, [ready, results]);

  const value = useMemo(
    () => ({ ready, pans, setPans, marks, setMarks, results, setResults }),
    [ready, pans, marks, results]
  );

  return <Allotment.Provider value={value}>{children}</Allotment.Provider>;
}

/* ------------------------------------------------------------------------ */

export function PanBox() {
  const { ready, pans, setPans, marks, setMarks, results, setResults } =
    useAllotment();
  const [draft, setDraft] = useState("");
  const [error, setError] = useState(null);

  const addPan = (event) => {
    event.preventDefault();
    const value = draft.trim().toUpperCase();
    if (!value) return;
    if (!PAN_SHAPE.test(value)) {
      setError("That is not a PAN. The shape is five letters, four digits, one letter.");
      return;
    }
    if (pans.includes(value)) {
      setError("That PAN is already on the list.");
      return;
    }
    setPans((current) => (current.includes(value) ? current : [...current, value]));
    setDraft("");
    setError(null);
  };

  const removePan = (pan) => setPans((current) => current.filter((p) => p !== pan));

  /**
   * Everything this page holds, gone in one tap.
   *
   * A PAN is a government identifier. Telling someone it lives in their
   * browser is only half an answer if getting it out again means finding
   * their way into site settings — so the promise in the privacy policy is
   * a button here, not an instruction there.
   */
  const eraseAll = () => {
    setPans([]);
    setMarks({});
    setResults({});
    for (const key of [PAN_KEY, MARK_KEY, RESULT_KEY, ...LEGACY_KEYS]) remove(key);
  };

  const anything =
    pans.length || Object.keys(marks).length || Object.keys(results).length;

  return (
    <section className="card card-wide" id="pans">
      <h2>Your PANs</h2>
      <p className="subtitle">
        Saved in this browser only. A PAN never reaches this site&apos;s
        server and never goes into a web address. For issues handled by KFin,
        pressing Check sends it from your browser straight to KFin — the same
        request their own page makes.
      </p>

      <form className="pan-form" onSubmit={addPan}>
        <input
          className="pan-input"
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value.toUpperCase());
            setError(null);
          }}
          placeholder="ABCDE1234F"
          maxLength={10}
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          aria-label="PAN to add"
          aria-invalid={error ? "true" : undefined}
        />
        <button type="submit" className="pan-add" disabled={!draft.trim()}>
          Add PAN
        </button>
      </form>
      {error ? <p className="pan-error">{error}</p> : null}

      {ready && pans.length ? (
        <ul className="pan-list">
          {pans.map((pan) => (
            <li key={pan} className="pan-chip">
              <span className="pan-value">{pan}</span>
              <button
                type="button"
                className="pan-remove"
                onClick={() => removePan(pan)}
                aria-label={`Remove ${pan}`}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="pan-empty">
          No PANs yet. Add one above — several if you apply for the family.
        </p>
      )}

      <p className="pan-privacy">
        Stored on this device only — <Link href="/privacy">how that works</Link>.
        {ready && anything ? (
          <>
            {" "}
            <button type="button" className="link-btn pan-erase" onClick={eraseAll}>
              Erase everything
            </button>
          </>
        ) : null}
      </p>
    </section>
  );
}

/* ------------------------------------------------------------------------ */

function fmtWhen(ms) {
  if (!ms) return null;
  try {
    return new Date(ms).toLocaleString("en-IN", {
      day: "numeric",
      month: "short",
      hour: "numeric",
      minute: "2-digit",
      timeZone: "Asia/Kolkata",
    });
  } catch {
    return null;
  }
}

function shares(n) {
  return `${Number(n || 0).toLocaleString("en-IN")} share${n === 1 ? "" : "s"}`;
}

/**
 * KFin's answer for one PAN, in the reader's terms.
 *
 * "none" is worded with care: KFin returns the same not-found for a PAN that
 * did not apply and for an issue whose data is not loaded yet, and on the
 * allotment date itself the second is the common case. A page that said
 * "you did not apply" to someone who did would be wrong in the way that
 * costs trust.
 */
function DirectResult({ result }) {
  if (!result) return null;
  const when = fmtWhen(result.at);
  const stamp = when ? <span className="lookup-when">checked {when}</span> : null;

  if (result.state === "allotted") {
    const total = result.rows.reduce((sum, r) => sum + (r.allotted || 0), 0);
    return (
      <div className="lookup-result" data-state="allotted">
        <p className="lookup-line">
          <strong>Allotted</strong> — {shares(total)}. {stamp}
        </p>
        <ul className="lookup-apps">
          {result.rows.map((r, i) => (
            <li key={r.application || i}>
              {r.name ? <span className="lookup-name">{r.name}</span> : null}
              {r.application ? <span>Application {r.application}</span> : null}
              <span>
                applied {Number(r.applied || 0).toLocaleString("en-IN")} · allotted{" "}
                {Number(r.allotted || 0).toLocaleString("en-IN")}
              </span>
              {r.category ? <span>{r.category}</span> : null}
            </li>
          ))}
        </ul>
      </div>
    );
  }
  if (result.state === "applied") {
    const total = result.rows.reduce((sum, r) => sum + (r.applied || 0), 0);
    return (
      <div className="lookup-result" data-state="applied">
        <p className="lookup-line">
          <strong>Not allotted</strong> — applied for {shares(total)}, none
          allotted. {stamp}
        </p>
      </div>
    );
  }
  if (result.state === "none") {
    return (
      <div className="lookup-result" data-state="none">
        <p className="lookup-line">
          <strong>Not found</strong> — KFin has no application under this PAN
          for this issue yet. Their page says the same until the data is
          loaded, usually on the allotment date; try again later. {stamp}
        </p>
      </div>
    );
  }
  if (result.state === "limited") {
    return (
      <div className="lookup-result" data-state="limited">
        <p className="lookup-line">
          <strong>KFin is limiting requests.</strong> Wait a minute and try
          again — this page will not retry on its own. {stamp}
        </p>
      </div>
    );
  }
  return (
    <div className="lookup-result" data-state="error">
      <p className="lookup-line">
        <strong>KFin did not answer.</strong> Try again in a moment, or use
        their page. {stamp}
      </p>
    </div>
  );
}

/**
 * The rows for one issue: one per PAN.
 *
 * `direct` with a `lookup` means KFin, and the row asks KFin itself. Anything
 * else is the hand-off: copy the PAN, go, come back and record it.
 */
export function IssueRows({ slug, name, direct, lookup, portal, registrarShort }) {
  const { ready, pans, marks, setMarks, results, setResults } = useAllotment();
  const [busy, setBusy] = useState({});
  const [copied, setCopied] = useState(null);
  const [batch, setBatch] = useState(false);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const canDirect = Boolean(direct && lookup?.client_id && lookup?.endpoint);

  const copyText = async (text, token) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(token);
      setTimeout(() => setCopied(null), 1600);
    } catch {
      /* clipboard refused; everything here is on screen to read */
    }
  };

  const mark = (pan, outcome) =>
    setMarks((current) => {
      const key = `${slug}|${pan}`;
      const next = { ...current };
      // The empty value is "not checked yet", which is an absence rather than
      // a third answer — storing it would make the counts below wrong.
      if (!outcome) delete next[key];
      else next[key] = outcome;
      return next;
    });

  const check = async (pan) => {
    const key = `${slug}|${pan}`;
    setBusy((b) => ({ ...b, [pan]: true }));
    const result = await lookupKfin({
      endpoint: lookup.endpoint,
      clientId: lookup.client_id,
      pan,
    });
    if (!alive.current) return result;
    setResults((current) => ({ ...current, [key]: { ...result, at: Date.now() } }));
    setBusy((b) => {
      const next = { ...b };
      delete next[pan];
      return next;
    });
    return result;
  };

  const checkAll = async () => {
    setBatch(true);
    for (let i = 0; i < pans.length; i += 1) {
      if (!alive.current) break;
      // eslint-disable-next-line no-await-in-loop
      const result = await check(pans[i]);
      // Their limit, respected: the rest of the batch waits for the reader.
      if (result.state === "limited") break;
      if (i < pans.length - 1) {
        // eslint-disable-next-line no-await-in-loop
        await new Promise((r) => setTimeout(r, BATCH_GAP_MS));
      }
    }
    if (alive.current) setBatch(false);
  };

  if (!ready) {
    return (
      <p className="allot-rows-empty">
        Your PANs appear here once you have added them above.
      </p>
    );
  }
  if (!pans.length) {
    return (
      <p className="allot-rows-empty">
        <a href="#pans">Add a PAN above</a> to check this issue.
      </p>
    );
  }

  const outcomeOf = (pan) => {
    if (canDirect) {
      const r = results[`${slug}|${pan}`];
      return r?.state === "allotted" ? "allotted" : r?.state === "applied" ? "none" : undefined;
    }
    return marks[`${slug}|${pan}`];
  };

  return (
    <>
      {canDirect && pans.length > 1 ? (
        <p className="lookup-batch">
          <button
            type="button"
            className="lookup-btn"
            disabled={batch}
            onClick={checkAll}
          >
            {batch ? "Checking…" : `Check all ${pans.length} with ${registrarShort}`}
          </button>
        </p>
      ) : null}

      {!canDirect ? (
        <p className="lookup-batch">
          <button
            type="button"
            className="result-copy-name"
            onClick={() => copyText(name, "name")}
          >
            {copied === "name" ? "Company name copied" : "Copy company name for their dropdown"}
          </button>
        </p>
      ) : null}

      <ul className="result-rows">
        {pans.map((pan) => {
          const key = `${slug}|${pan}`;
          const outcome = outcomeOf(pan);
          return (
            <li key={pan} className="result-row" data-outcome={outcome}>
              <div className="result-row-main">
                <button
                  type="button"
                  className="result-pan"
                  onClick={() => copyText(pan, `pan:${pan}`)}
                  title="Copy this PAN"
                >
                  {pan}
                  <span className="result-copy">
                    {copied === `pan:${pan}` ? "Copied" : "Copy"}
                  </span>
                </button>

                {canDirect ? (
                  <button
                    type="button"
                    className="lookup-btn"
                    disabled={Boolean(busy[pan]) || batch}
                    onClick={() => check(pan)}
                  >
                    {busy[pan]
                      ? "Asking KFin…"
                      : results[key]
                        ? "Check again"
                        : `Check with ${registrarShort}`}
                  </button>
                ) : (
                  <label className="result-marks">
                    <span className="result-marks-label">What the registrar showed</span>
                    <select
                      className="result-select"
                      value={marks[key] || ""}
                      data-outcome={marks[key]}
                      onChange={(event) => mark(pan, event.target.value)}
                    >
                      {OUTCOMES.map((o) => (
                        <option key={o.key || "unset"} value={o.key}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
              </div>

              {canDirect ? <DirectResult result={results[key]} /> : null}
            </li>
          );
        })}
      </ul>

      {!canDirect && portal ? (
        <p className="allot-rows-foot">
          Open {registrarShort} above, then set each row to what their page said.
        </p>
      ) : null}
    </>
  );
}

/* ------------------------------------------------------------------------ */

/**
 * One issue at a time, chosen from a dropdown.
 *
 * Eighteen stacked sections was the whole list on one screen, and the owner
 * was right that nobody reads a page that way: you know which issue you
 * applied for. So the list is the dropdown, grouped as the page groups it,
 * and the section below is the one you picked. The choice rides in the URL
 * hash — no PAN in it, nothing stored, and a link to a specific issue's
 * check is a link that works.
 *
 * The first at-allotment issue is rendered on the server, so the raw HTML
 * still carries a real heading and a real registrar, and the dropdown's
 * option text carries every other company's name.
 */
export function IssuePicker({ issues }) {
  const [slug, setSlug] = useState(issues[0]?.slug || "");

  useEffect(() => {
    const wanted = decodeURIComponent((window.location.hash || "").slice(1));
    if (wanted && issues.some((i) => i.slug === wanted)) setSlug(wanted);
  }, [issues]);

  const pick = (next) => {
    setSlug(next);
    try {
      window.history.replaceState(null, "", `#${next}`);
    } catch {
      /* history refused; the choice still stands for this page view */
    }
  };

  const issue = issues.find((i) => i.slug === slug) || issues[0];
  if (!issue) return null;

  const atAllotment = issues.filter((i) => i.status === "allotment");
  const listed = issues.filter((i) => i.status === "listed");

  const optionText = (i) =>
    `${i.short_name || i.name} — ${i.registrar?.short || "registrar not published"}` +
    (i.listing_date
      ? ` · ${i.status === "listed" ? "listed" : "lists"} ${fmtDate(i.listing_date)}`
      : "");

  return (
    <>
      <section className="card card-wide">
        <h2>Select IPO</h2>
        <p className="subtitle subtitle-flush">
          {atAllotment.length} at allotment, {listed.length} listed. Pick the
          one you applied for.
        </p>
        <label className="allot-pick">
          <span className="allot-pick-label">IPO</span>
          <select
            className="allot-select"
            value={issue.slug}
            onChange={(event) => pick(event.target.value)}
          >
            {atAllotment.length ? (
              <optgroup label={`At allotment (${atAllotment.length})`}>
                {atAllotment.map((i) => (
                  <option key={i.slug} value={i.slug}>
                    {optionText(i)}
                  </option>
                ))}
              </optgroup>
            ) : null}
            {listed.length ? (
              <optgroup label={`Listed (${listed.length})`}>
                {listed.map((i) => (
                  <option key={i.slug} value={i.slug}>
                    {optionText(i)}
                  </option>
                ))}
              </optgroup>
            ) : null}
          </select>
        </label>
      </section>

      <section className="card card-wide allot-issue" id={issue.slug}>
        <div className="result-head">
          <div>
            <h2 className="allot-issue-title">
              {issue.short_name || issue.name} IPO allotment status
            </h2>
            <p className="allot-issue-meta">
              {issue.board ? `${issue.board} · ` : ""}
              Registrar <strong>{issue.registrar?.name || "not published"}</strong>
              {issue.allotment_date
                ? ` · Allotment ${fmtDate(issue.allotment_date, true)}`
                : ""}
              {issue.listing_date
                ? ` · ${issue.status === "listed" ? "Listed" : "Lists"} ${fmtDate(issue.listing_date, true)}`
                : ""}
            </p>
          </div>
          {issue.registrar?.portal ? (
            <a
              className="result-open"
              href={issue.registrar.portal}
              target="_blank"
              rel="noopener noreferrer nofollow"
            >
              Open {issue.registrar.short}
              <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
                <path
                  d="M6 3h7v7M13 3 4 12"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </a>
          ) : null}
        </div>

        {issue.direct ? (
          <p className="allot-direct">
            Checked with KFin directly from your browser, the way their own
            page does it — nothing passes through this site. KFin lists this
            issue as <strong>{issue.lookup.name}</strong>.
          </p>
        ) : issue.registrar ? (
          <ol className="result-steps">
            {issue.registrar.steps.map((step) => (
              <li key={step}>{step}</li>
            ))}
            <li>Come back and set the row below to what it said</li>
          </ol>
        ) : (
          <p className="allot-direct">
            NSE has not published a registrar for this issue yet. The
            prospectus names one; it will appear here when the next scrape
            finds it.
          </p>
        )}

        <IssueRows
          key={issue.slug}
          slug={issue.slug}
          name={issue.name}
          direct={issue.direct}
          lookup={issue.lookup}
          portal={issue.registrar?.portal || null}
          registrarShort={issue.registrar?.short || "the registrar"}
        />

        <p className="allot-issue-foot">
          <Link href={`/ipo/${issue.slug}`}>
            {issue.short_name || issue.name} IPO page
          </Link>{" "}
          — GMP, subscription by category, timetable and documents.
        </p>
      </section>
    </>
  );
}
