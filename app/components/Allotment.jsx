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
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { fmtDate } from "../../lib/format";
import { lookupKfin } from "../../lib/kfin";
import {
  clearLocalPanTraces,
  MAX_PANS,
  removeAllPans,
  removePan,
  watchPans,
} from "../../lib/pans";
import { useAuth } from "./AuthProvider";
import PanModal from "./PanModal";

// PANs are NO LONGER kept in this browser. They live in Firestore under the
// signed-in reader's own uid, so a signed-out visitor leaves nothing
// PAN-shaped behind on the device — which is the requirement, and is
// stricter than what this page did before.
//
// What still lives locally is the reader's own notes: which rows they have
// marked, and what KFin answered. Both are keyed by `slug|PAN`, so the key
// itself carries a PAN — which is why they are namespaced per uid and wiped
// the moment the session ends. See clearLocalPanTraces().
const MARK_KEY = "ipo-allotment-marks";
const RESULT_KEY = "ipo-allotment-results";
// Written by older versions of this page. Removed on load rather than left
// behind: the privacy policy lists what is stored, and a key it no longer
// names should not exist. "ipo-pans" is on this list now — the PANs it held
// have moved to the account.
const LEGACY_KEYS = ["ipo-allotment-picks", "ipo-pans"];

/** Per-user, because the notes are about that user's PANs. */
const scoped = (key, uid) => (uid ? `${key}:${uid}` : null);


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
  const { user, loading: authLoading, requireAuth } = useAuth();
  const uid = user?.uid || null;

  const [pans, setPans] = useState([]);
  const [marks, setMarks] = useState({});
  const [results, setResults] = useState({});
  const [panError, setPanError] = useState(null);
  // True once we KNOW the PAN list — either Firestore has answered, or there
  // is no session and the answer is "none". Distinct from authLoading, and
  // the thing every consumer must wait for before concluding "no PANs".
  const [ready, setReady] = useState(false);

  /* ---- PANs: Firestore, and only while signed in --------------------- */
  useEffect(() => {
    // Still working out who this is. Conclude nothing yet.
    if (authLoading) return undefined;

    if (!uid) {
      // Signed out: no PANs, and nothing PAN-shaped left on the device.
      setPans([]);
      setMarks({});
      setResults({});
      clearLocalPanTraces();
      setPanError(null);
      setReady(true);
      return undefined;
    }

    let cancelled = false;
    let unsubscribe = () => {};
    setReady(false);

    (async () => {
      try {
        unsubscribe = await watchPans(
          uid,
          (list) => {
            if (cancelled) return;
            setPans(list);
            setReady(true);
          },
          () => {
            if (cancelled) return;
            setPanError("Could not load your saved PANs.");
            setReady(true);
          }
        );
      } catch {
        if (!cancelled) {
          setPanError("Could not load your saved PANs.");
          setReady(true);
        }
      }
    })();

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [uid, authLoading]);

  /* ---- notes: local, per-uid, and never for a signed-out reader ------ */
  useEffect(() => {
    for (const key of LEGACY_KEYS) remove(key);
    if (!uid) return;
    setMarks(read(scoped(MARK_KEY, uid), {}));
    setResults(read(scoped(RESULT_KEY, uid), {}));
  }, [uid]);

  useEffect(() => {
    if (uid && ready) write(scoped(MARK_KEY, uid), marks);
  }, [uid, ready, marks]);
  useEffect(() => {
    if (uid && ready) write(scoped(RESULT_KEY, uid), results);
  }, [uid, ready, results]);

  const forgetPan = useCallback(
    async (pan) => {
      if (!uid) return;
      const result = await removePan(uid, pan);
      if (!result.ok) setPanError(result.reason);
      // The snapshot listener updates `pans`; the notes for that PAN go too,
      // because a note about a PAN nobody holds is just a stored PAN.
      setMarks((current) => {
        const next = {};
        for (const [key, value] of Object.entries(current)) {
          if (!key.endsWith(`|${pan}`)) next[key] = value;
        }
        return next;
      });
      setResults((current) => {
        const next = {};
        for (const [key, value] of Object.entries(current)) {
          if (!key.endsWith(`|${pan}`)) next[key] = value;
        }
        return next;
      });
    },
    [uid]
  );

  const forgetEverything = useCallback(async () => {
    if (!uid) return;
    const result = await removeAllPans(uid, pans);
    if (!result.ok) setPanError(result.reason);
    setMarks({});
    setResults({});
    clearLocalPanTraces();
  }, [uid, pans]);

  const value = useMemo(
    () => ({
      ready,
      uid,
      authLoading,
      requireAuth,
      pans,
      panError,
      clearPanError: () => setPanError(null),
      forgetPan,
      forgetEverything,
      marks,
      setMarks,
      results,
      setResults,
    }),
    [
      ready,
      uid,
      authLoading,
      requireAuth,
      pans,
      panError,
      forgetPan,
      forgetEverything,
      marks,
      results,
    ]
  );

  return <Allotment.Provider value={value}>{children}</Allotment.Provider>;
}

/* ------------------------------------------------------------------------ */

export function PanBox() {
  const {
    ready,
    uid,
    authLoading,
    requireAuth,
    pans,
    panError,
    clearPanError,
    forgetPan,
    forgetEverything,
  } = useAllotment();
  const [draft, setDraft] = useState("");
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [modal, setModal] = useState(false);
  // Dismissing the add-PAN prompt is remembered for the session. Someone who
  // came to read the timetable should not be asked on every render.
  const [prompted, setPrompted] = useState(false);

  /**
   * The prompt, and the one condition it waits for.
   *
   * `ready` means Firestore has actually answered. Opening on `!pans.length`
   * before that would flash the modal at someone who has three PANs saved —
   * the same class of bug as concluding "signed out" while auth is loading.
   */
  useEffect(() => {
    if (!uid || !ready || prompted) return;
    if (pans.length === 0) {
      setModal(true);
      setPrompted(true);
    }
  }, [uid, ready, pans.length, prompted]);

  const onAdd = async (event) => {
    event.preventDefault();
    setError(null);
    clearPanError();
    // No PAN is accepted, held or sent anywhere until there is an account to
    // attach it to. The gate opens the dialog and resolves null if closed.
    const who = await requireAuth();
    if (!who) return;
    setModal(true);
  };

  const onForget = async (pan) => {
    setBusy(true);
    await forgetPan(pan);
    setBusy(false);
  };

  const onEraseAll = async () => {
    setBusy(true);
    await forgetEverything();
    setBusy(false);
  };

  const shown = panError || error;

  return (
    <section className="card card-wide" id="pans">
      <div className="allot-card-head">
        <h2>Your PANs</h2>
        {uid && ready && pans.length ? (
          <span className="allot-count">
            {pans.length} of {MAX_PANS} saved
          </span>
        ) : null}
      </div>

      {!uid ? (
        <>
          <p className="subtitle subtitle-flush">
            Saved to your account, so they are there on every device — and
            reachable by nobody else. Signing in is the only way a PAN is
            stored at all; signed out, this site keeps none.
          </p>
          <button
            type="button"
            className="lookup-btn lookup-btn-lg pan-signin"
            onClick={onAdd}
            disabled={authLoading}
          >
            {authLoading ? "Checking…" : "Sign in to add a PAN"}
          </button>
        </>
      ) : (
        <>
          <p className="subtitle subtitle-flush">
            Saved to your account and visible only to you. Remove one and it is
            deleted, here and from our database.
          </p>

          {!ready ? (
            <p className="auth-status" role="status">
              Loading your PANs…
            </p>
          ) : (
            <>
              {pans.length ? (
                <ul className="pan-list">
                  {pans.map((pan) => (
                    <li key={pan} className="pan-chip">
                      <span className="pan-value">{pan}</span>
                      <button
                        type="button"
                        className="pan-remove"
                        onClick={() => onForget(pan)}
                        disabled={busy}
                        aria-label={`Remove ${pan}`}
                      >
                        ×
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="pan-empty">
                  No PANs yet — add one to check an allotment.
                </p>
              )}

              <button
                type="button"
                className="ghost-btn pan-add-btn"
                onClick={() => setModal(true)}
                disabled={busy || pans.length >= MAX_PANS}
              >
                {pans.length >= MAX_PANS ? `Limit is ${MAX_PANS}` : "Add a PAN"}
              </button>
            </>
          )}
        </>
      )}

      {shown ? (
        <p className="auth-error" role="alert">
          {shown}
        </p>
      ) : null}

      <p className="pan-privacy">
        {uid
          ? "Stored in your account, never shared, deleted when you remove it"
          : "Nothing is stored until you sign in"}{" "}
        — <Link href="/privacy">how that works</Link>.
        {uid && pans.length ? (
          <>
            {" "}
            <button
              type="button"
              className="link-btn pan-erase"
              onClick={onEraseAll}
              disabled={busy}
            >
              Erase everything
            </button>
          </>
        ) : null}
      </p>

      {modal && uid ? (
        <PanModal
          uid={uid}
          existing={pans}
          onClose={() => setModal(false)}
          onAdded={() => setError(null)}
        />
      ) : null}
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
  const { ready, uid, requireAuth, pans, marks, setMarks, results, setResults } =
    useAllotment();
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
    // The gate, before anything goes over the wire. Closing the dialog
    // resolves null and we simply do not check — the page does not move.
    if (!(await requireAuth())) return { state: "cancelled", rows: [] };
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
    if (!(await requireAuth())) return;
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

/* ------------------------------------------------------------------------ */

/**
 * Check several issues at once, for every saved PAN.
 *
 * The single-issue picker above is the right shape when you know which issue
 * you applied for. On allotment day, people who apply to everything that is
 * open want one pass over all of it instead: tick the issues, press check,
 * read the verdicts. The batch reuses the same per-issue machinery — the
 * KFin request is identical, the PANs never leave this browser — and the
 * same courtesy gap, stretched across the whole batch rather than restarted
 * per issue, because KFin's limit does not reset when we move to the next
 * company.
 *
 * Issues their registrar keeps behind a CAPTCHA cannot be asked from here
 * (see the table in PROJECT_CONTEXT §8.3 for why each one is out). They are
 * still in the list — a batch that silently dropped them would read as a
 * batch that checked them — but their card is the hand-off: the registrar
 * link, the steps, and the same manual record control as the single view.
 */
export function MultiIssueChecker({ issues }) {
  const { ready, uid, requireAuth, pans, marks, setMarks, results, setResults } =
    useAllotment();
  const [selected, setSelected] = useState([]);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(null);
  // Set by the Stop button; separate from the unmount guard so stopping one
  // batch does not poison the next.
  const stopRef = useRef(false);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const atAllotment = issues.filter((i) => i.status === "allotment");
  const listed = issues.filter((i) => i.status === "listed");
  const chosen = issues.filter((i) => selected.includes(i.slug));

  const toggle = (slug) =>
    setSelected((current) =>
      current.includes(slug)
        ? current.filter((s) => s !== slug)
        : [...current, slug]
    );

  const mark = (slug, pan, outcome) =>
    setMarks((current) => {
      const key = `${slug}|${pan}`;
      const next = { ...current };
      if (!outcome) delete next[key];
      else next[key] = outcome;
      return next;
    });

  const runBatch = async () => {
    if (!(await requireAuth())) return;
    // Only KFin-direct issues go over the wire; the hand-off cards need no
    // request and are already on screen for the reader to work through.
    const queue = [];
    for (const issue of chosen) {
      if (!issue.direct || !issue.lookup) continue;
      for (const pan of pans) queue.push({ issue, pan });
    }
    if (!queue.length) return;

    stopRef.current = false;
    setRunning(true);
    setProgress({ done: 0, total: queue.length });

    for (let i = 0; i < queue.length; i += 1) {
      if (!alive.current || stopRef.current) break;
      const { issue, pan } = queue[i];
      // eslint-disable-next-line no-await-in-loop
      const result = await lookupKfin({
        endpoint: issue.lookup.endpoint,
        clientId: issue.lookup.client_id,
        pan,
      });
      if (!alive.current) break;
      const key = `${issue.slug}|${pan}`;
      setResults((current) => ({
        ...current,
        [key]: { ...result, at: Date.now() },
      }));
      // Their limit, respected across the batch: the rest waits for the
      // reader rather than hammering through a 429.
      if (result.state === "limited") break;
      if (alive.current && !stopRef.current)
        setProgress({ done: i + 1, total: queue.length });
      if (i < queue.length - 1 && !stopRef.current) {
        // eslint-disable-next-line no-await-in-loop
        await new Promise((r) => setTimeout(r, BATCH_GAP_MS));
      }
    }
    if (alive.current) {
      setRunning(false);
      setProgress(null);
    }
  };

  // Across the batch, for the summary line: an issue counts once, on any
  // PAN allotted. Manual hand-off records are the reader's own notes, not
  // checked answers, so they stay out of this count.
  const summary = useMemo(() => {
    let checked = 0;
    let won = 0;
    let shares = 0;
    for (const issue of chosen) {
      if (!issue.direct) continue;
      let issueChecked = false;
      let issueWon = false;
      for (const pan of pans) {
        const r = results[`${issue.slug}|${pan}`];
        if (!r) continue;
        issueChecked = true;
        if (r.state === "allotted") {
          issueWon = true;
          shares += r.rows.reduce((s, x) => s + (x.allotted || 0), 0);
        }
      }
      if (issueChecked) checked += 1;
      if (issueWon) won += 1;
    }
    return { checked, won, shares };
  }, [chosen, pans, results]);

  if (!ready) {
    return (
      <section className="card card-wide" aria-busy="true">
        <h2>Check several at once</h2>
        <p className="subtitle subtitle-flush">Loading your PANs…</p>
      </section>
    );
  }

  const canRun =
    !running && selected.length > 0 && pans.length > 0;

  const groupLabel = (list, label) =>
    list.length ? (
      <div className="multi-group">
        <h3 className="multi-group-title">
          {label} ({list.length})
        </h3>
        <ul className="multi-pick-list">
          {list.map((issue) => {
            const on = selected.includes(issue.slug);
            return (
              <li key={issue.slug}>
                <label className="multi-pick" data-on={on || undefined}>
                  <input
                    type="checkbox"
                    className="multi-check"
                    checked={on}
                    onChange={() => toggle(issue.slug)}
                    aria-label={`Select ${issue.short_name || issue.name}`}
                  />
                  <span className="multi-pick-main">
                    <span className="multi-pick-name">
                      {issue.short_name || issue.name}
                    </span>
                    <span className="multi-pick-meta">
                      {issue.board ? (
                        <span className="allot-pill">{issue.board}</span>
                      ) : null}
                      <span className="multi-pick-registrar">
                        {issue.registrar?.short || "Registrar not published"}
                      </span>
                      {issue.direct ? (
                        <span className="allot-live-pill">Live check</span>
                      ) : null}
                    </span>
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      </div>
    ) : null;

  return (
    <section className="card card-wide" id="multi-check">
      <div className="allot-card-head">
        <h2>Check several at once</h2>
        {selected.length ? (
          <span className="allot-count">{selected.length} selected</span>
        ) : null}
      </div>
      <p className="subtitle subtitle-flush">
        Tick the issues you applied for, then check them all in one pass.
        KFin issues are asked live from your browser; the rest open at their
        registrar for you to check by hand.
      </p>

      {!pans.length ? (
        <p className="allot-rows-empty">
          <a href="#pans">Add a PAN above</a> before checking — there is
          nothing to ask KFin about yet.
        </p>
      ) : null}

      {groupLabel(atAllotment, "At allotment")}
      {groupLabel(listed, "Listed")}

      <div className="allot-actions">
        <button
          type="button"
          className="lookup-btn lookup-btn-lg"
          disabled={!canRun}
          onClick={runBatch}
        >
          {running
            ? "Checking…"
            : selected.length
              ? `Check ${selected.length} issue${selected.length === 1 ? "" : "s"}`
              : "Check selected"}
        </button>
        {running ? (
          <button
            type="button"
            className="ghost-btn"
            onClick={() => {
              stopRef.current = true;
            }}
          >
            Stop
          </button>
        ) : null}
        {progress ? (
          <p className="allot-summary" role="status">
            Checking {progress.done} of {progress.total}…
          </p>
        ) : null}
        {summary.checked > 0 && !running ? (
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

      {chosen.length > 0 ? (
        <div className="multi-results">
          {chosen.map((issue) => (
            <MultiIssueCard
              key={issue.slug}
              issue={issue}
              pans={pans}
              results={results}
              marks={marks}
              onMark={mark}
            />
          ))}
        </div>
      ) : null}
    </section>
  );
}

/**
 * One issue's worth of batch results.
 *
 * Direct issues show the KFin verdict per PAN, reusing the same Verdict as
 * the single-issue view so an answer reads identically in both places.
 * Hand-off issues show the registrar steps and the manual record control —
 * the batch cannot answer those, but it can keep the question and the
 * answer in one place.
 */
function MultiIssueCard({ issue, pans, results, marks, onMark }) {
  return (
    <article className="multi-card" id={`multi-${issue.slug}`}>
      <div className="allot-issue-head">
        <span
          className="allot-mark"
          data-direct={issue.direct || undefined}
          aria-hidden="true"
        >
          {issue.registrar?.mark || "?"}
        </span>
        <div className="allot-issue-id">
          <h3 className="allot-issue-title">
            {issue.short_name || issue.name}
          </h3>
          <p className="allot-issue-meta">
            <span
              className="allot-pill"
              data-tone={issue.status === "allotment" ? "live" : undefined}
            >
              {issue.status === "allotment" ? "At allotment" : "Listed"}
            </span>
            <span className="allot-registrar">
              {issue.registrar?.name || "Registrar not published"}
            </span>
            {issue.direct ? (
              <span className="allot-live-pill">Live check</span>
            ) : null}
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

      {!issue.direct && issue.registrar ? (
        <div className="allot-handoff">
          <p className="allot-handoff-title">
            {issue.registrar.short} keeps this behind a CAPTCHA — the last
            step is yours
          </p>
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
      ) : null}

      <ul className="result-rows">
        {pans.map((pan) => {
          const key = `${issue.slug}|${pan}`;
          return (
            <li key={pan} className="result-row">
              <div className="result-row-main">
                <span className="result-pan">
                  <span className="pan-value">{pan}</span>
                </span>
                {!issue.direct ? (
                  <label className="result-marks">
                    <span className="result-marks-label">
                      What {issue.registrar?.short || "the registrar"} showed
                    </span>
                    <select
                      className="result-select"
                      value={marks[key] || ""}
                      data-outcome={marks[key]}
                      onChange={(event) =>
                        onMark(issue.slug, pan, event.target.value)
                      }
                    >
                      {OUTCOMES.map((o) => (
                        <option key={o.key || "unset"} value={o.key}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}
              </div>
              {issue.direct ? <Verdict result={results[key]} /> : null}
            </li>
          );
        })}
      </ul>
    </article>
  );
}
