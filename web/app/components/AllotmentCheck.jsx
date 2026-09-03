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
import MultiSelect from "./MultiSelect";
import { STATUS_LABEL } from "../../lib/format";

const PAN_KEY = "ipo-pans";
const PICK_KEY = "ipo-allotment-picks";
const MARK_KEY = "ipo-allotment-marks";

/** Five letters, four digits, one letter — the format the registrars want. */
const PAN_SHAPE = /^[A-Z]{5}[0-9]{4}[A-Z]$/;

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
    // Saved picks are dropped once their issue has left the list — it lists,
    // and the page stops offering it. Kept, they counted towards the "3
    // selected" badge while showing neither a chip nor a row, so the number
    // on the dropdown disagreed with everything under it.
    const available = new Set(ipos.map((ipo) => ipo.slug));
    setPicks(read(PICK_KEY, []).filter((slug) => available.has(slug)));
    setMarks(read(MARK_KEY, {}));
    setReady(true);
    // Deliberately once, on mount: this prunes what was stored, and re-running
    // it whenever the list changes would fight a reader mid-selection.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      // The empty value is "not checked yet", which is an absence rather than
      // a third answer — storing it would make the counts below wrong.
      if (!outcome) delete next[key];
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
          Issues whose allotment is out — {ipos.length}
          {ipos.length === 1 ? " right now" : " right now"}. An issue leaves
          this list the day it lists, because by then the shares are either in
          your demat account or they are not.
        </p>

        <MultiSelect
          label="Choose IPOs to check"
          placeholder="Select companies…"
          emptyText="No allotment out right now"
          options={ipos.map((ipo) => ({
            key: ipo.slug,
            label: ipo.short_name || ipo.name,
            note: ipo.registrar || "Registrar not published",
            tag: STATUS_LABEL[ipo.status] || ipo.status,
          }))}
          selected={picks}
          onToggle={togglePick}
          onSelectAll={() => setPicks(ipos.map((ipo) => ipo.slug))}
          onClear={() => setPicks([])}
        />

        {/* Repeated outside the dropdown so the choice is still visible once
            it is shut, and removable without opening it again. */}
        {chosen.length ? (
          <ul className="pan-list">
            {chosen.map((ipo) => (
              <li key={ipo.slug} className="pan-chip">
                <span className="chip-name">{ipo.short_name || ipo.name}</span>
                <button
                  type="button"
                  className="pan-remove"
                  onClick={() => togglePick(ipo.slug)}
                  aria-label={`Remove ${ipo.short_name || ipo.name}`}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        ) : null}

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
            the PAN, answer their CAPTCHA, then set the dropdown to what their
            page said. That dropdown is yours to set — it records what you
            saw, it is not a result this site worked out.
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
                <li>Come back and set the dropdown to what it said</li>
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

                      <label className="result-marks">
                        <span className="result-marks-label">
                          What the registrar showed
                        </span>
                        <select
                          className="result-select"
                          value={current || ""}
                          data-outcome={current}
                          onChange={(event) =>
                            mark(ipo.slug, pan, event.target.value)
                          }
                        >
                          {OUTCOMES.map((outcome) => (
                            <option key={outcome.key || "unset"} value={outcome.key}>
                              {outcome.label}
                            </option>
                          ))}
                        </select>
                      </label>
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
