"use client";

/**
 * The interactive half of the allotment page: PANs, and what each issue's
 * registrar says about them.
 *
 * TWO TABS, BECAUSE THERE ARE TWO QUESTIONS. "Check allotment" starts from an
 * issue and needs no account at all — pick one, read how its registrar wants
 * to be asked, go and ask. "My PAN & allotment" starts from a PAN you saved
 * and shows where it stands across the recent issues. One scroll holding both
 * met a signed-out reader with a PAN box before the instructions that do not
 * need one.
 *
 * THE DEFAULT TAB IS THE CRAWLABLE ONE. "Check allotment" renders on the
 * server, so the raw HTML carries a real heading, a registrar, the steps and
 * — in the picker and the list beneath it — every tracked company's name.
 * The other panel is not rendered until it is chosen, which costs nothing:
 * it is about one reader's own data and has no business in search results.
 *
 * WHERE THE PANs LIVE. In Firestore, under the signed-in reader's own account
 * id, readable by them alone — see lib/pans.js, and /privacy, which sets out
 * what that means. Nothing is stored for a reader who is not signed in. The
 * LOOKUP is a separate matter and has not changed: the one request carrying a
 * PAN goes from this browser straight to KFin's allotment API, for the issues
 * KFin handles, because KFin's own page makes exactly that request and their
 * API accepts it from any origin (see lib/kfin.js). This site's server is not
 * on that path. Every other registrar puts the answer behind a CAPTCHA, and
 * there the last step stays the reader's: open their page, paste, read, and
 * record what it said.
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
import { NSE_BID_CHECK } from "../../lib/registrars";
import {
  clearLocalPanTraces,
  MAX_PANS,
  removeAllPans,
  removePan,
  watchPans,
} from "../../lib/pans";
import { useAuth } from "./AuthProvider";
import GoogleMark from "./GoogleMark";
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
 * What to say above the hand-off steps.
 *
 * The generic line blames a CAPTCHA, which is true of every registrar here
 * except the one that matters: KFin has none. A KFin issue only lands in the
 * hand-off when the scraper could not read this issue's id off KFin's list,
 * and telling the reader KFin is gating them is both false and discouraging
 * — their page takes a PAN and answers it.
 */
function handoffTitle(registrar) {
  if (registrar?.direct) {
    return `${registrar.short} has no CAPTCHA — we just could not read this issue's id from their list, so the last step is yours`;
  }
  return `${registrar.short} keeps this behind a CAPTCHA — the last step is yours`;
}

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

/* ------------------------------------------------------------------------ */

/**
 * The page's two halves, as tabs.
 *
 * They answer different questions and need different things from the reader.
 * "Check allotment" needs no account at all: pick an issue, read how its
 * registrar wants to be asked, go and ask. "My PAN" is the other direction —
 * start from a PAN you saved and see where it stands across the recent
 * issues. Putting both on one scroll meant a signed-out reader met a PAN box
 * before the instructions that do not need one.
 *
 * The choice is remembered per browser, not per account: it is a view
 * preference, not data, and a reader who always wants one tab should not have
 * to sign in for the page to remember.
 */
const TAB_KEY = "ipo-allotment-tab";
const TABS = [
  { key: "check", label: "Check allotment" },
  { key: "mine", label: "My PAN & allotment" },
];

export function AllotmentTabs({ issues, today }) {
  const [tab, setTab] = useState("check");
  const tabRefs = useRef({});

  useEffect(() => {
    const stored = read(TAB_KEY, null);
    if (stored && TABS.some((t) => t.key === stored)) setTab(stored);
  }, []);

  const choose = (key) => {
    setTab(key);
    write(TAB_KEY, key);
  };

  /* A tablist is expected to move with the arrow keys; without this the
     only way between panels is Tab through every control in the open one. */
  const onKeyDown = (event) => {
    const i = TABS.findIndex((t) => t.key === tab);
    let next = null;
    if (event.key === "ArrowRight") next = TABS[(i + 1) % TABS.length];
    if (event.key === "ArrowLeft") next = TABS[(i - 1 + TABS.length) % TABS.length];
    if (event.key === "Home") next = TABS[0];
    if (event.key === "End") next = TABS[TABS.length - 1];
    if (!next) return;
    event.preventDefault();
    choose(next.key);
    tabRefs.current[next.key]?.focus();
  };

  return (
    <>
      <div className="allot-tabs" role="tablist" aria-label="Allotment" onKeyDown={onKeyDown}>
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            id={`tab-${t.key}`}
            aria-selected={tab === t.key}
            aria-controls={`panel-${t.key}`}
            /* Only the selected tab is in the tab order; the arrows move
               between them, which is what a tablist is supposed to do. */
            tabIndex={tab === t.key ? 0 : -1}
            ref={(el) => {
              tabRefs.current[t.key] = el;
            }}
            className="allot-tab"
            data-active={tab === t.key ? "true" : undefined}
            onClick={() => choose(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div
        role="tabpanel"
        id="panel-check"
        aria-labelledby="tab-check"
        hidden={tab !== "check"}
      >
        {tab === "check" ? <CheckAllotmentTab issues={issues} today={today} /> : null}
      </div>

      <div
        role="tabpanel"
        id="panel-mine"
        aria-labelledby="tab-mine"
        hidden={tab !== "mine"}
      >
        {tab === "mine" ? <MyPanTab issues={issues} /> : null}
      </div>
    </>
  );
}

/* ------------------------------------------------------------------------ */

/** The ten most recent, in the order the page already ranks them: issues at
 *  allotment first, then the most recently listed. */
function latestTen(issues) {
  return (issues || []).slice(0, 10);
}

/**
 * Tab one — how to check this issue, wherever it has to be checked.
 *
 * No PAN and no account. The reader picks an issue and gets the registrar's
 * own steps and a link to the page those steps describe.
 */
function CheckAllotmentTab({ issues, today }) {
  const list = latestTen(issues);
  const [slug, setSlug] = useState(list[0]?.slug || "");

  // A link into a particular issue still works, as it did before the tabs.
  useEffect(() => {
    const follow = () => {
      const wanted = decodeURIComponent((window.location.hash || "").slice(1));
      if (wanted && list.some((i) => i.slug === wanted)) setSlug(wanted);
    };
    follow();
    window.addEventListener("hashchange", follow);
    return () => window.removeEventListener("hashchange", follow);
  }, [issues]);

  const issue = list.find((i) => i.slug === slug) || list[0];
  if (!issue) return null;

  const pick = (next) => {
    setSlug(next);
    try {
      window.history.replaceState(null, "", `#${next}`);
    } catch {
      /* history refused; the choice still stands for this page view */
    }
  };

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
            onChange={(e) => pick(e.target.value)}
          >
            {list.map((i) => (
              <option key={i.slug} value={i.slug}>
                {optionText(i)}
              </option>
            ))}
          </select>
        </div>
      </label>

      <div className="allot-issue-head">
        <span className="allot-mark" aria-hidden="true">
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
      </div>

      <Rail issue={issue} today={today} />

      {issue.registrar ? (
        <div className="allot-handoff">
          <p className="allot-handoff-title">
            How to check {issue.short_name || issue.name} on{" "}
            {issue.registrar.short}
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
          </ol>
          {issue.registrar.portal ? (
            <a
              className="result-open allot-steps-go"
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
      ) : (
        <p className="allot-direct">
          NSE has not published a registrar for this issue yet. The prospectus
          names one; it will appear here with the next update.
        </p>
      )}

      {issue.nseBid ? (
        <div className="allot-nse">
          <span className="allot-nse-tag" aria-hidden="true">NSE</span>
          <p className="allot-nse-text">
            <strong>Also on NSE.</strong> Pick this issue and enter your PAN.
            <small>
              Only bids placed via NSE show up. Missing there doesn&apos;t
              mean not allotted.
            </small>
          </p>
          <a
            className="allot-nse-go"
            href={NSE_BID_CHECK.portal}
            target="_blank"
            rel="noopener noreferrer nofollow"
          >
            Verify on NSE<span aria-hidden="true"> ↗</span>
          </a>
        </div>
      ) : null}

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
 * What is known about one PAN on one issue, from either of the two places an
 * answer can come from.
 *
 * A live KFin answer outranks a note the reader typed: both are about the
 * same application, and the registrar is the one who decides. `none` from
 * KFin is not "not allotted" — it is "no application under this PAN", which
 * usually means they applied somewhere else or through another PAN, so it is
 * said in those words rather than as a verdict.
 */
function statusOf(slug, pan, results, marks) {
  const key = `${slug}|${pan}`;
  const live = results[key];
  if (live) {
    if (live.state === "allotted") return { tone: "allotted", label: "Allotted", via: "KFin" };
    if (live.state === "applied") return { tone: "none", label: "Not allotted", via: "KFin" };
    if (live.state === "none") return { tone: "absent", label: "No application found", via: "KFin" };
    if (live.state === "limited") return { tone: "absent", label: "KFin is rate-limiting", via: null };
  }
  const noted = marks[key];
  if (noted === "allotted") return { tone: "allotted", label: "Allotted", via: "your note" };
  if (noted === "none") return { tone: "none", label: "Not allotted", via: "your note" };
  return null;
}

/**
 * Tab two — the reader's own PANs, and where each one stands.
 *
 * The other tab starts from an issue; this one starts from a PAN, which is
 * the question someone actually has on allotment day: "did I get any of
 * these". Each PAN is listed against the same ten issues, so the answer is
 * one block of rows rather than ten separate lookups.
 */
function MyPanTab({ issues }) {
  const {
    ready,
    uid,
    authLoading,
    pans,
    panError,
    clearPanError,
    forgetPan,
    requireAuth,
  } = useAllotment();
  const [modal, setModal] = useState(false);
  const list = latestTen(issues);

  if (authLoading) {
    return (
      <section className="card card-wide">
        <p className="auth-status" role="status">
          Checking your sign-in…
        </p>
      </section>
    );
  }

  // Signed out. One action, and it is the only thing this tab can offer:
  // a PAN is never stored for a reader without an account, so there is
  // nothing to show and nothing to add until they have one.
  if (!uid) {
    return (
      <section className="card card-wide mypan-signin" aria-labelledby="mypan-signin-title">
        <div className="mypan-signin-badge" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="28" height="28">
            <path
              d="M12 3 5 6v5c0 4.4 3 8.3 7 9.5 4-1.2 7-5.1 7-9.5V6l-7-3Z"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinejoin="round"
            />
            <path
              d="m9 12 2 2 4-4"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>

        <h2 id="mypan-signin-title" className="mypan-signin-title">
          Your PANs, ready for every allotment
        </h2>
        <p className="mypan-signin-lede">
          Sign in once and every issue is a tap away: your PANs, checked against
          the latest allotments, without typing them again.
        </p>

        <ul className="mypan-signin-perks">
          <li>
            <span className="mypan-perk-icon" aria-hidden="true">1</span>
            <span>
              <strong>Save each PAN once</strong>
              <small>Yours and your family&apos;s — up to {MAX_PANS}.</small>
            </span>
          </li>
          <li>
            <span className="mypan-perk-icon" aria-hidden="true">2</span>
            <span>
              <strong>Check them all together</strong>
              <small>Every saved PAN against the ten most recent issues.</small>
            </span>
          </li>
          <li>
            <span className="mypan-perk-icon" aria-hidden="true">3</span>
            <span>
              <strong>Private to you</strong>
              <small>Held against your account and shown to no one else.</small>
            </span>
          </li>
        </ul>

        {/* The same popup the rest of the page opens, in place: the reader
            stays on this tab and lands on their (empty) PAN list the moment
            the sign-in resolves. */}
        <div className="mypan-signin-actions">
          <button
            type="button"
            className="lookup-btn lookup-btn-lg mypan-signin-google"
            onClick={() => requireAuth()}
          >
            <GoogleMark size={18} />
            Continue with Google
          </button>
          <button
            type="button"
            className="mypan-signin-phone"
            onClick={() => requireAuth("phone")}
          >
            Use phone number instead
          </button>
        </div>

        <p className="mypan-signin-foot">
          No account needed to <strong>check an allotment</strong> — the other
          tab has the steps and the registrar&apos;s own page.
        </p>
      </section>
    );
  }

  return (
    <section className="card card-wide" id="pans">
      <div className="allot-card-head">
        <h2>Your PANs</h2>
        {ready && pans.length ? (
          <span className="allot-count">
            {pans.length} of {MAX_PANS} saved
          </span>
        ) : null}
      </div>

      {!ready ? (
        <p className="auth-status" role="status">
          Loading your PANs…
        </p>
      ) : (
        <>
          {pans.length ? (
            <div className="mypan-blocks">
              {pans.map((pan) => (
                <PanAllotments
                  key={pan}
                  pan={pan}
                  issues={list}
                  onForget={() => forgetPan(pan)}
                />
              ))}
            </div>
          ) : (
            <p className="pan-empty">
              No PANs yet — add one and this becomes a list of where it stands.
            </p>
          )}

          <button
            type="button"
            className="ghost-btn pan-add-btn"
            onClick={() => setModal(true)}
            disabled={pans.length >= MAX_PANS}
          >
            {pans.length >= MAX_PANS ? `Limit is ${MAX_PANS}` : "Add a PAN"}
          </button>
        </>
      )}

      {panError ? (
        <p className="auth-error" role="alert">
          {panError}
        </p>
      ) : null}

      <p className="pan-privacy">
        Stored in your account, never shared, deleted when you remove it —{" "}
        <Link href="/privacy">how that works</Link>.
      </p>

      {modal && uid ? (
        <PanModal
          uid={uid}
          existing={pans}
          onClose={() => setModal(false)}
          onAdded={clearPanError}
        />
      ) : null}
    </section>
  );
}

/**
 * One PAN, against the recent issues.
 *
 * Every issue gets a row whether or not anything is known about it, because
 * an absent row would be indistinguishable from an issue the reader did not
 * apply for. An unknown row says so and offers the way to find out, which is
 * a live check where KFin can take one and the registrar's own page where it
 * cannot.
 */
function PanAllotments({ pan, issues, onForget }) {
  const { requireAuth, marks, setMarks, results, setResults } = useAllotment();
  const [busy, setBusy] = useState({});
  const [copied, setCopied] = useState(null);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const canDirect = (issue) =>
    Boolean(issue.direct && issue.lookup?.client_id && issue.lookup?.endpoint);

  const check = async (issue) => {
    if (!(await requireAuth())) return;
    const key = `${issue.slug}|${pan}`;
    setBusy((b) => ({ ...b, [issue.slug]: true }));
    const result = await lookupKfin({
      endpoint: issue.lookup.endpoint,
      clientId: issue.lookup.client_id,
      pan,
    });
    if (!alive.current) return;
    setResults((current) => ({ ...current, [key]: { ...result, at: Date.now() } }));
    setBusy((b) => {
      const next = { ...b };
      delete next[issue.slug];
      return next;
    });
  };

  const mark = (slug, outcome) =>
    setMarks((current) => {
      const key = `${slug}|${pan}`;
      const next = { ...current };
      // Empty is "not checked yet" — an absence, not a third answer.
      if (!outcome) delete next[key];
      else next[key] = outcome;
      return next;
    });

  const openWithPan = async (token) => {
    try {
      await navigator.clipboard.writeText(pan);
      setCopied(token);
      setTimeout(() => setCopied(null), 1600);
    } catch {
      /* clipboard refused; the PAN is on screen to read */
    }
  };

  const checkable = issues.filter(canDirect);

  const checkAll = async () => {
    if (!(await requireAuth())) return;
    for (const issue of checkable) {
      if (!alive.current) break;
      // eslint-disable-next-line no-await-in-loop
      await check(issue);
    }
  };

  return (
    <article className="mypan-block">
      <div className="mypan-head">
        <span className="pan-value">{pan}</span>
        <div className="mypan-head-actions">
          {checkable.length ? (
            <button
              type="button"
              className="ghost-btn mypan-checkall"
              onClick={checkAll}
              disabled={Object.keys(busy).length > 0}
            >
              {Object.keys(busy).length
                ? "Checking…"
                : `Check ${checkable.length} with KFin`}
            </button>
          ) : null}
          <button
            type="button"
            className="pan-remove"
            onClick={onForget}
            aria-label={`Remove ${pan}`}
          >
            ×
          </button>
        </div>
      </div>

      <ul className="mypan-list">
        {issues.map((issue) => {
          const status = statusOf(issue.slug, pan, results, marks);
          const live = canDirect(issue);
          return (
            <li key={issue.slug} className="mypan-row" data-tone={status?.tone}>
              <div className="mypan-issue">
                <Link href={`/ipo/${issue.slug}`} className="mypan-name">
                  {issue.short_name || issue.name}
                </Link>
                <span className="mypan-reg">
                  {issue.registrar?.short || "registrar not published"}
                </span>
              </div>

              <div className="mypan-status">
                {live ? (
                  status ? (
                    <>
                      <span className="mypan-word">{status.label}</span>
                      {status.via ? (
                        <span className="mypan-via">from {status.via}</span>
                      ) : null}
                    </>
                  ) : (
                    <span className="mypan-word mypan-unknown">Not checked</span>
                  )
                ) : (
                  /* Nobody can ask this registrar for the reader, so the cell
                     is where they put what it told them. Writing it down is
                     the only way this row stops saying "Not checked". */
                  <label className="mypan-mark">
                    <span className="sr-only">
                      What {issue.registrar?.short || "the registrar"} showed for{" "}
                      {issue.short_name || issue.name}
                    </span>
                    <select
                      className="result-select mypan-select"
                      value={marks[`${issue.slug}|${pan}`] || ""}
                      data-outcome={marks[`${issue.slug}|${pan}`]}
                      onChange={(event) => mark(issue.slug, event.target.value)}
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

              <div className="mypan-action">
                {live ? (
                  <button
                    type="button"
                    className="lookup-btn"
                    onClick={() => check(issue)}
                    disabled={Boolean(busy[issue.slug])}
                  >
                    {busy[issue.slug] ? "Asking…" : status ? "Again" : "Check"}
                  </button>
                ) : issue.registrar?.portal ? (
                  <a
                    className="result-go"
                    href={issue.registrar.portal}
                    target="_blank"
                    rel="noopener noreferrer nofollow"
                    onClick={() => openWithPan(issue.slug)}
                  >
                    {copied === issue.slug
                      ? "PAN copied"
                      : `Open ${issue.registrar.short}`}
                  </a>
                ) : (
                  <span className="mypan-via">no registrar page</span>
                )}
              </div>

              {live && results[`${issue.slug}|${pan}`] ? (
                <div className="mypan-verdict">
                  <Verdict result={results[`${issue.slug}|${pan}`]} />
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </article>
  );
}
