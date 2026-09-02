"use client";

/**
 * Allotment checking, for several PANs across several IPOs at once.
 *
 * WHAT THIS CANNOT DO, AND WHY. It cannot fetch anyone's allotment. Every
 * registrar that matters here — Bigshare, KFin, MUFG Intime, Skyline — puts
 * the status behind a CAPTCHA, which exists precisely to stop a site like
 * this asking on your behalf. Working around one would be both a breach of
 * their terms and the wrong thing to do, so the button below does not
 * pretend: it opens each registrar with the PAN already on your clipboard.
 *
 * WHAT IT REPLACES. Six IPOs across three registrars is today six searches
 * for the right site, six retypings of a ten-character PAN, and no record at
 * the end of which ones you already looked at. This makes it one screen: the
 * registrar for each issue is already known, the PAN is one tap from the
 * form, and what you find goes back into the page so the list becomes the
 * answer rather than something you hold in your head.
 *
 * WHERE THE PANs LIVE. This browser, and nowhere else. A PAN is a government
 * identifier, so it is never sent to our server — there is no request that
 * could carry it — and never put in a URL, where it would end up in history
 * and in any log along the way. localStorage on this device is the whole of
 * it, and the page says so where it is asked for.
 */

import { useEffect, useMemo, useState } from "react";
import { StatusBadge } from "./ui";

const PAN_KEY = "ipo-pans";
const PICK_KEY = "ipo-allotment-picks";
const MARK_KEY = "ipo-allotment-marks";

/** Five letters, four digits, one letter — the format the registrars want. */
const PAN_SHAPE = /^[A-Z]{5}[0-9]{4}[A-Z]$/;

const OUTCOMES = [
  { key: "allotted", label: "Allotted", tone: "up" },
  { key: "none", label: "Not allotted", tone: "down" },
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
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* full, or disabled — the page still works for this session */
  }
}

export default function AllotmentCheck({ ipos }) {
  const [pans, setPans] = useState([]);
  const [picks, setPicks] = useState([]);
  const [marks, setMarks] = useState({});
  const [draft, setDraft] = useState("");
  const [error, setError] = useState(null);
  const [checking, setChecking] = useState(false);
  const [copied, setCopied] = useState(null);
  // Nothing is read from storage during render: the server has no
  // localStorage, and a first client render that disagreed with the server's
  // would be a hydration mismatch.
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setPans(read(PAN_KEY, []));
    setPicks(read(PICK_KEY, []));
    setMarks(read(MARK_KEY, {}));
    setReady(true);
  }, []);

  // Persisted by watching the state rather than by writing alongside every
  // setter. Two taps in the same tick both read the state as React last
  // rendered it, so a setter that computes from `picks` rather than from the
  // value React hands it drops one of them — which is exactly what a quick
  // double-tap on two issues did. The `ready` guard keeps the empty initial
  // state from being written over what is stored before the load runs.
  useEffect(() => {
    if (ready) write(PAN_KEY, pans);
  }, [ready, pans]);
  useEffect(() => {
    if (ready) write(PICK_KEY, picks);
  }, [ready, picks]);
  useEffect(() => {
    if (ready) write(MARK_KEY, marks);
  }, [ready, marks]);

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

  const removePan = (pan) =>
    setPans((current) => current.filter((p) => p !== pan));

  const togglePick = (slug) =>
    setPicks((current) =>
      current.includes(slug)
        ? current.filter((s) => s !== slug)
        : [...current, slug]
    );

  const mark = (slug, pan, outcome) =>
    setMarks((current) => {
      const key = `${slug}|${pan}`;
      const next = { ...current };
      if (next[key] === outcome) delete next[key];
      else next[key] = outcome;
      return next;
    });

  const copyText = async (text, token) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(token);
      setTimeout(() => setCopied(null), 1600);
    } catch {
      /* clipboard refused; everything here is on screen to read */
    }
  };

  const chosen = useMemo(
    () => ipos.filter((ipo) => picks.includes(ipo.slug)),
    [ipos, picks]
  );

  const done = useMemo(
    () =>
      chosen.reduce(
        (count, ipo) =>
          count + pans.filter((pan) => marks[`${ipo.slug}|${pan}`]).length,
        0
      ),
    [chosen, pans, marks]
  );
  const total = chosen.length * pans.length;
  const allotted = useMemo(
    () =>
      chosen.reduce(
        (count, ipo) =>
          count +
          pans.filter((pan) => marks[`${ipo.slug}|${pan}`] === "allotted").length,
        0
      ),
    [chosen, pans, marks]
  );

  const canCheck = pans.length > 0 && chosen.length > 0;

  if (!ready) return null;

  return (
    <>
      <section className="card card-wide">
        <h2>Your PANs</h2>
        <p className="subtitle">
          Saved in this browser only. A PAN never reaches our server and never
          goes into a web address — there is no request here that carries one.
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

        {pans.length ? (
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
      </section>

      <section className="card card-wide">
        <h2>Choose IPOs</h2>
        <p className="subtitle">
          Only issues past their allotment date can be checked. There
          {ipos.length === 1 ? " is 1" : ` are ${ipos.length}`} right now.
        </p>

        {ipos.length === 0 ? (
          <p className="pan-empty">
            Nothing has reached allotment yet. This fills in as issues close.
          </p>
        ) : (
          <div className="pick-list">
            {ipos.map((ipo) => {
              const on = picks.includes(ipo.slug);
              return (
                <button
                  key={ipo.slug}
                  type="button"
                  className="pick"
                  role="checkbox"
                  aria-checked={on}
                  data-on={on || undefined}
                  onClick={() => togglePick(ipo.slug)}
                >
                  <span className="pick-box" aria-hidden="true">
                    {on ? (
                      <svg viewBox="0 0 16 16" width="12" height="12">
                        <path
                          d="M3 8.4 6.2 11.5 13 4.8"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2.4"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    ) : null}
                  </span>
                  <span className="pick-text">
                    <span className="pick-name">{ipo.short_name || ipo.name}</span>
                    <span className="pick-note">
                      {ipo.registrar || "Registrar not published"}
                    </span>
                  </span>
                  <StatusBadge status={ipo.status} />
                </button>
              );
            })}
          </div>
        )}

        <button
          type="button"
          className="check-btn"
          disabled={!canCheck}
          onClick={() => setChecking(true)}
        >
          {canCheck
            ? `Build my checklist (${total} to check)`
            : "Add a PAN and pick an IPO"}
        </button>
      </section>

      {checking && canCheck ? (
        <section className="card card-wide" id="allotment-results">
          <h2>Your checklist</h2>
          <p className="subtitle">
            One row per PAN per issue. For each one: open the registrar, paste
            the PAN, answer their CAPTCHA, then tap what their page said. The
            two buttons are yours to set — they record what you saw, they are
            not a result this site worked out.
          </p>

          <p className="check-summary" role="status">
            <strong>{done}</strong> of {total} checked
            {done > 0 ? (
              <>
                {" · "}
                <span className="check-won">{allotted} allotted</span>
              </>
            ) : null}
          </p>

          {chosen.map((ipo) => (
            <div key={ipo.slug} className="result-block">
              <div className="result-head">
                <div>
                  <h3 className="result-name">{ipo.short_name || ipo.name}</h3>
                  <p className="result-registrar">
                    {ipo.registrar || "Registrar not published"}
                  </p>
                  {/* Their dropdown lists the full legal name, which is not
                      always what anyone calls the company. */}
                  <button
                    type="button"
                    className="result-copy-name"
                    onClick={() => copyText(ipo.name, `name:${ipo.slug}`)}
                  >
                    {copied === `name:${ipo.slug}`
                      ? "Company name copied"
                      : "Copy company name"}
                  </button>
                </div>
                {ipo.registrar_url ? (
                  <a
                    className="result-open"
                    href={ipo.registrar_url}
                    target="_blank"
                    rel="noopener noreferrer nofollow"
                  >
                    Open registrar
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

              <ol className="result-steps">
                <li>Open the registrar and pick this company from their list</li>
                <li>Paste the PAN and answer their CAPTCHA</li>
                <li>Come back and tap what their page said</li>
              </ol>

              <ul className="result-rows">
                {pans.map((pan) => {
                  const current = marks[`${ipo.slug}|${pan}`];
                  return (
                    <li key={pan} className="result-row" data-outcome={current}>
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

                      <span className="result-marks">
                        {/* Only while nothing is pressed. A row with neither
                            button set was being read as a "no", and nobody
                            must mistake "not looked at yet" for "did not get
                            any" — but once a button IS pressed it says so
                            itself, and repeating it beside it reads as two
                            different facts. */}
                        {current ? null : (
                          <span className="result-state">Not checked yet</span>
                        )}
                        {OUTCOMES.map((outcome) => (
                          <button
                            key={outcome.key}
                            type="button"
                            className="result-mark"
                            data-tone={outcome.tone}
                            data-on={current === outcome.key || undefined}
                            aria-pressed={current === outcome.key}
                            onClick={() => mark(ipo.slug, pan, outcome.key)}
                          >
                            {outcome.label}
                          </button>
                        ))}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </section>
      ) : null}
    </>
  );
}
