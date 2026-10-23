/**
 * A signed-in reader's PAN numbers, in Firestore.
 *
 * WHAT CHANGED, AND WHY IT MATTERS. Until now a PAN lived only in the
 * reader's own browser and this site's privacy policy said so in as many
 * words. Storing them server-side is a deliberate reversal: the owner asked
 * for it so a PAN follows them across devices. It makes this project a data
 * fiduciary for a government identifier, so the handling below is stricter
 * than the rest of the codebase, and /privacy says all of it plainly.
 *
 * ONE DOCUMENT PER PAN, AND THE DOCUMENT ID IS THE PAN.
 *   users/{uid}/pans/{PAN}  ->  { value, createdAt }
 * Two reasons, both structural rather than stylistic. A duplicate becomes
 * impossible without counting anything. And the security rule can check the
 * FORMAT of every write — rules cannot iterate a list, so an array of PANs
 * could only ever be validated by its length. The rule is the guarantee; the
 * checks in this file are the courtesy that keeps a bad write from leaving
 * the browser at all.
 *
 * NOTHING HERE RUNS WITHOUT A UID. Every function takes one and refuses
 * without it, so there is no path where an unauthenticated reader writes.
 */

import { getFirebaseAuth } from "./firebase";

/** Five letters, four digits, one letter — and the same regex the rule uses. */
export const PAN_SHAPE = /^[A-Z]{5}[0-9]{4}[A-Z]$/;

/**
 * A ceiling, enforced here and nowhere else.
 *
 * A security rule cannot count the documents in a subcollection, so this is
 * a product limit rather than a protection — it stops a slip turning into a
 * hundred rows, and it is honest about being only that. Ten covers a family.
 */
export const MAX_PANS = 10;

let dbPromise = null;

async function getDb() {
  // Auth is resolved first so this module cannot initialise Firestore on a
  // page that has no Firebase config at all.
  const auth = await getFirebaseAuth();
  if (!auth) return null;
  if (!dbPromise) {
    dbPromise = import("firebase/firestore").then(({ getFirestore }) =>
      getFirestore(auth.app)
    );
  }
  try {
    return await dbPromise;
  } catch (error) {
    dbPromise = null;
    throw error;
  }
}

export function normalisePan(raw) {
  return String(raw || "").trim().toUpperCase().replace(/\s+/g, "");
}

/**
 * Live list of this user's PANs.
 *
 * A subscription rather than a fetch, so a PAN added on a phone shows up on
 * the desktop that is already open — which is the whole reason these moved
 * off the device. Returns its own unsubscribe.
 */
export async function watchPans(uid, onChange, onError) {
  if (!uid) return () => {};
  const db = await getDb();
  if (!db) return () => {};
  const { collection, onSnapshot, orderBy, query } = await import(
    "firebase/firestore"
  );
  const ref = query(
    collection(db, "users", uid, "pans"),
    orderBy("createdAt", "asc")
  );
  return onSnapshot(
    ref,
    (snap) => {
      onChange(snap.docs.map((d) => d.data()?.value).filter(Boolean));
    },
    (error) => {
      if (onError) onError(error);
    }
  );
}

/**
 * @returns {{ok: true} | {ok: false, reason: string}} — a message fit to show,
 * never a Firebase code.
 */
export async function addPan(uid, raw, existing = []) {
  const value = normalisePan(raw);
  if (!uid) return { ok: false, reason: "You need to be signed in to save a PAN." };
  if (!value) return { ok: false, reason: "Enter a PAN." };
  if (!PAN_SHAPE.test(value)) {
    return {
      ok: false,
      reason: "That is not a PAN. The shape is five letters, four digits, one letter.",
    };
  }
  if (existing.includes(value)) {
    return { ok: false, reason: "That PAN is already saved." };
  }
  if (existing.length >= MAX_PANS) {
    return { ok: false, reason: `You can save up to ${MAX_PANS} PANs.` };
  }

  try {
    const db = await getDb();
    if (!db) return { ok: false, reason: "Saving is unavailable right now." };
    const { doc, serverTimestamp, setDoc } = await import("firebase/firestore");
    await setDoc(doc(db, "users", uid, "pans", value), {
      value,
      // The server's clock, not the device's — the rule requires a timestamp
      // and a device clock is not one we should trust or need.
      createdAt: serverTimestamp(),
    });
    return { ok: true };
  } catch (error) {
    return { ok: false, reason: storeErrorMessage(error) };
  }
}

/** Removes it from Firestore. There is no soft delete and no tombstone. */
export async function removePan(uid, raw) {
  const value = normalisePan(raw);
  if (!uid || !value) return { ok: false, reason: "Nothing to remove." };
  try {
    const db = await getDb();
    if (!db) return { ok: false, reason: "Removing is unavailable right now." };
    const { deleteDoc, doc } = await import("firebase/firestore");
    await deleteDoc(doc(db, "users", uid, "pans", value));
    return { ok: true };
  } catch (error) {
    return { ok: false, reason: storeErrorMessage(error) };
  }
}

/** Every PAN this user has saved, gone. Used by "Erase everything". */
export async function removeAllPans(uid, values = []) {
  if (!uid || !values.length) return { ok: true };
  try {
    const db = await getDb();
    if (!db) return { ok: false, reason: "Removing is unavailable right now." };
    const { deleteDoc, doc } = await import("firebase/firestore");
    // Sequential rather than batched: ten documents at most, and a partial
    // failure then leaves a clear state rather than an ambiguous one.
    for (const value of values) {
      await deleteDoc(doc(db, "users", uid, "pans", value));
    }
    return { ok: true };
  } catch (error) {
    return { ok: false, reason: storeErrorMessage(error) };
  }
}

/**
 * Every PAN-shaped trace this device holds, gone.
 *
 * The allotment page keeps two local notes — which rows the reader marked,
 * and what KFin answered — and BOTH are keyed by `slug|PAN`, so the keys
 * themselves carry a PAN. They are written only while signed in, but that is
 * not enough on its own: a reader who signs out from the account page would
 * otherwise leave them sitting in a signed-out browser. So this runs on
 * sign-out, wherever sign-out happens, rather than only where the notes are
 * written.
 */
export function clearLocalPanTraces() {
  const PREFIXES = ["ipo-allotment-marks", "ipo-allotment-results"];
  const EXACT = ["ipo-pans", "ipo-allotment-picks"];
  try {
    for (const key of Object.keys(localStorage)) {
      if (EXACT.includes(key) || PREFIXES.some((p) => key === p || key.startsWith(`${p}:`))) {
        localStorage.removeItem(key);
      }
    }
  } catch {
    /* storage unavailable — nothing to clear */
  }
}

function storeErrorMessage(error) {
  const code = String(error?.code || "");
  if (code === "permission-denied") {
    // Reached only if the rules and the client disagree — worth saying
    // plainly rather than dressing up as a network blip.
    return "That save was refused. Please sign in again and retry.";
  }
  if (code === "unavailable" || code === "failed-precondition") {
    return "Could not reach the database. Check your connection and try again.";
  }
  return "Could not save that. Please try again.";
}
