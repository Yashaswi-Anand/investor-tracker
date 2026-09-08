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
      <div className="allot-card-head">
        <h2>Your PANs</h2>
        {ready && pans.length ? (
          <span className="allot-count">
            {pans.length} saved
          </span>
        ) : null}
      </div>
      <p className="subtitle subtitle-flush">
        Saved in this browser only, and used for every issue below.
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
          No PANs yet — add one above, or several if you apply for the family.
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

const n = (v) => Number(v || 0).toLocaleString("en-IN");

/**
 * KFin's answer for one PAN, as the thing the page is for.
 *
 * The verdict is the largest element in the row, in the semantic colour,
 * with the share count set as a figure rather than buried in a sentence —
 * on allotment day a reader is scanning several PANs for one word.
 *
 * "none" is worded with care: KFin returns the same not-found for a PAN that
 * did not apply and for an issue whose data is not loaded yet, and on the
 * allotment date itself the second is the common case. A page that said
 * "you did not apply" to someone who did would be wrong in the way that
 * costs trust.
 */
function Verdict({ result }) {
  if (!result) return null;
  const when = fmtWhen(result.at);

  if (result.state === "allotted") {
    const total = result.rows.reduce((sum, r) => sum + (r.allotted || 0), 0);
    return (
      <div className="verdict" data-state="allotted">
        <div className="verdict-head">
          <span className="verdict-word">Allotted</span>
          <span className="verdict-figure num">{n(total)}</span>
          <span className="verdict-unit">
            share{total === 1 ? "" : "s"}
          </span>
        </div>
        <ul className="verdict-apps">
          {result.rows.map((r, i) => (
            <li key={r.application || i}>
              {r.name ? <span className="verdict-name">{r.name}</span> : null}
              {r.application ? <span>App {r.application}</span> : null}
              <span>
                {n(r.applied)} applied → <strong>{n(r.allotted)} allotted</strong>
              </span>
              {r.category ? <span className="verdict-cat">{r.category}</span> : null}
            </li>
          ))}
        </ul>
        {when ? <p className="verdict-when">Checked {when} IST</p> : null}
      </div>
    );
  }

  if (result.state === "applied") {
    const total = result.rows.reduce((sum, r) => sum + (r.applied || 0), 0);
    return (
      <div className="verdict" data-state="applied">
        <div className="verdict-head">
          <span className="verdict-word">Not allotted</span>
          <span className="verdict-sub">
            applied for {n(total)} share{total === 1 ? "" : "s"}, none allotted
          </span>
        </div>
        {when ? <p className="verdict-when">Checked {when} IST</p> : null}
      </div>
    );
  }

  if (result.state === "none") {
    return (
      <div className="verdict" data-state="none">
        <div className="verdict-head">
          <span className="verdict-word">Not found</span>
          <span className="verdict-sub">
            KFin has no application under this PAN for this issue yet
          </span>
        </div>
        <p className="verdict-note">
          Their own page says the same until the data is loaded, usually on the
          allotment date. Try again later.
        </p>
        {when ? <p className="verdict-when">Checked {when} IST</p> : null}
      </div>
    );
  }

  if (result.state === "limited") {
    return (
      <div className="verdict" data-state="limited">
        <div className="verdict-head">
          <span className="verdict-word">KFin is limiting requests</span>
        </div>
        <p className="verdict-note">
          Wait a minute and try again — this page will not retry on its own.
        </p>
      </div>
    );
  }

  return (
    <div className="verdict" data-state="error">
      <div className="verdict-head">
        <span className="verdict-word">KFin did not answer</span>
      </div>
      <p className="verdict-note">
        Try again in a moment, or use their page.
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
export function IssueRows({
  slug,
  name,
  direct,
  lookup,
  portal,
  registrarShort,
  handoff,
}) {
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

  // A one-line answer for the whole issue, above the rows, so several PANs
  // do not have to be read one at a time.
  const summary = canDirect
    ? (() => {
        const seen = pans.map((p) => results[`${slug}|${p}`]).filter(Boolean);
        if (!seen.length) return null;
        const won = seen.filter((r) => r.state === "allotted");
        const shares = won.reduce(
          (sum, r) => sum + r.rows.reduce((s, x) => s + (x.allotted || 0), 0),
          0
        );
        return { checked: seen.length, won: won.length, shares };
      })()
    : null;

  const outcomeOf = (pan) => {
    if (canDirect) {
      const r = results[`${slug}|${pan}`];
      return r?.state === "allotted"
        ? "allotted"
        : r?.state === "applied"
          ? "none"
          : undefined;
    }
    return marks[`${slug}|${pan}`];
  };

  return (
    <>
      <div className="allot-actions">
        {canDirect ? (
          pans.length > 1 ? (
            <button
              type="button"
              className="lookup-btn lookup-btn-lg"
              disabled={batch}
              onClick={checkAll}
            >
              {batch ? "Checking…" : `Check all ${pans.length} PANs`}
            </button>
          ) : null
        ) : (
          <button
            type="button"
            className="ghost-btn"
            onClick={() => copyText(handoff?.name || name, "name")}
          >
            {copied === "name"
              ? "Copied — paste it in their dropdown"
              : handoff
                ? `Copy “${handoff.name}”`
                : "Copy company name"}
          </button>
        )}

        {summary ? (
          <p className="allot-summary" role="status">
            <strong>{summary.checked}</strong> checked
            {summary.won > 0 ? (
              <>
                {" · "}
                <span className="allot-summary-won">
                  {summary.won} allotted, {n(summary.shares)} shares
                </span>
              </>
            ) : (
              <> · none allotted</>
            )}
          </p>
        ) : null}
      </div>

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
                        : "Check"}
                  </button>
                ) : (
                  <label className="result-marks">
                    <span className="result-marks-label">
                      What {registrarShort} showed
                    </span>
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

              {canDirect ? <Verdict result={results[key]} /> : null}
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
 * The issue's own timetable, as a rail.
 *
 * It answers the question that comes straight after "did I get any": when the
 * money comes back, when the shares arrive, when it trades. Steps already
 * past are filled; the next one is marked. A step with no published date is
 * drawn but left blank rather than dropped, so the shape of the week is the
 * same on every issue.
 */
function Rail({ issue, today }) {
  const steps = [
    ["Allotment", issue.allotment_date],
    ["Refund", issue.refund_date],
    ["Demat", issue.demat_date],
    ["Listing", issue.listing_date],
  ];
  if (!steps.some(([, date]) => date)) return null;

  const nextIndex = steps.findIndex(([, date]) => date && date >= today);

  return (
    <ol className="allot-rail">
      {steps.map(([label, date], i) => {
        const state = !date
          ? "unknown"
          : date < today
            ? "done"
            : i === nextIndex
              ? "next"
              : "ahead";
        return (
          <li key={label} className="allot-rail-step" data-state={state}>
            <span className="allot-rail-dot" aria-hidden="true" />
            <span className="allot-rail-label">{label}</span>
            <span className="allot-rail-date">
              {date ? fmtDate(date, true) : "—"}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/**
 * One issue at a time, chosen from a dropdown that sits in the same card as
 * the issue it controls.
 *
 * Eighteen stacked sections was the whole list on one screen, and nobody
 * reads a page that way: you know which issue you applied for. The choice
 * rides in the URL hash — no PAN in it, nothing stored, and a link to a
 * specific issue's check is a link that works.
 *
 * The first at-allotment issue is rendered on the server, so the raw HTML
 * carries a real heading, a real registrar and the rail, and the dropdown's
 * option text carries every other company's name.
 */
export function IssuePicker({ issues, today }) {
  const [slug, setSlug] = useState(issues[0]?.slug || "");

  // On mount AND on every later hash change. Without the listener the
  // selection ignored a hash that arrived while the page was already open —
  // a link into a particular issue worked on a cold load and silently did
  // nothing from anywhere on the site that already had this page rendered.
  useEffect(() => {
    const follow = () => {
      const wanted = decodeURIComponent((window.location.hash || "").slice(1));
      if (wanted && issues.some((i) => i.slug === wanted)) setSlug(wanted);
    };
    follow();
    window.addEventListener("hashchange", follow);
    return () => window.removeEventListener("hashchange", follow);
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
    <section className="card card-wide allot-issue" id={issue.slug}>
      <label className="allot-pick">
        <span className="allot-pick-label">Select IPO</span>
        <div className="allot-pick-control">
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
          <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
            <path
              d="m4 6 4 4 4-4"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
      </label>

      <div className="allot-issue-head">
        <span
          className="allot-mark"
          data-direct={issue.direct || undefined}
          aria-hidden="true"
        >
          {issue.registrar?.mark || "?"}
        </span>
        <div className="allot-issue-id">
          <h2 className="allot-issue-title">
            {issue.short_name || issue.name} IPO allotment status
          </h2>
          <p className="allot-issue-meta">
            {issue.board ? <span className="allot-pill">{issue.board}</span> : null}
            <span
              className="allot-pill"
              data-tone={issue.status === "allotment" ? "live" : undefined}
            >
              {issue.status === "allotment" ? "At allotment" : "Listed"}
            </span>
            <span className="allot-registrar">
              {issue.registrar?.name || "Registrar not published"}
            </span>
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

      <Rail issue={issue} today={today} />

      {issue.direct ? (
        <p className="allot-direct">
          <span className="allot-live-pill">Live check</span>
          Asked of KFin directly from your browser, the way their own page does
          it — nothing passes through this site. KFin lists this issue as{" "}
          <strong>{issue.lookup.name}</strong>.
        </p>
      ) : issue.registrar ? (
        <div className="allot-handoff">
          <p className="allot-handoff-title">
            {issue.registrar.short} keeps this behind a CAPTCHA — the last step
            is yours
          </p>
          {/* The step that actually goes wrong is the first one. Their
              dropdown lists this issue under their own spelling, in a list of
              forty, and it is not what we call it. Read from the same list
              their page loads. */}
          {issue.handoff ? (
            <p className="allot-handoff-name">
              On their page it is listed as{" "}
              <strong>{issue.handoff.name}</strong>
            </p>
          ) : null}
          <ol className="result-steps">
            {issue.registrar.steps.map((step) => (
              <li key={step}>{step}</li>
            ))}
            <li>Come back and set the row below to what it said</li>
          </ol>
        </div>
      ) : (
        <p className="allot-direct">
          NSE has not published a registrar for this issue yet. The prospectus
          names one; it will appear here when the next scrape finds it.
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
        handoff={issue.handoff}
      />

      <p className="allot-issue-foot">
        <Link href={`/ipo/${issue.slug}`}>
          {issue.short_name || issue.name} IPO page
        </Link>{" "}
        — GMP, subscription by category, timetable and documents.
      </p>
    </section>
  );
}
