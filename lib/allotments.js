/**
 * Where each saved PAN stands, per issue, in Firestore.
 *
 *   users/{uid}/allotments/{slug}_{PAN}
 *     -> { pan, slug, result?, mark?, updatedAt }
 *
 * `result` is KFin's own answer (allotted / applied / none) with the rows it
 * returned; `mark` is what the reader recorded for a registrar we cannot ask.
 * Either may be absent. A transient answer — rate-limited, no reply — is
 * never stored: it says nothing about the application, only about the call.
 *
 * Like the PANs themselves, everything here needs a uid and the security
 * rule is the guarantee; these checks only keep a bad write off the wire.
 */

import { getFirebaseAuth } from "./firebase";
import { PAN_SHAPE } from "./pans";

/** The states worth keeping. Anything else is about the request, not the PAN. */
const STORED = new Set(["allotted", "applied", "none"]);
const MARKS = new Set(["allotted", "none"]);

let dbPromise = null;

async function getDb() {
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

const docId = (slug, pan) => `${slug}_${pan}`;

/**
 * Live map of every stored status for this user, keyed `slug|PAN` — the same
 * key the page already uses. Ten PANs against ten issues is a hundred
 * documents at most, so one subscription beats one per PAN.
 */
export async function watchAllotments(uid, onChange, onError) {
  if (!uid) return () => {};
  const db = await getDb();
  if (!db) return () => {};
  const { collection, onSnapshot } = await import("firebase/firestore");
  return onSnapshot(
    collection(db, "users", uid, "allotments"),
    (snap) => {
      const results = {};
      const marks = {};
      for (const d of snap.docs) {
        const data = d.data() || {};
        if (!data.slug || !data.pan) continue;
        const key = `${data.slug}|${data.pan}`;
        if (data.result && STORED.has(data.result.state)) results[key] = data.result;
        if (MARKS.has(data.mark)) marks[key] = data.mark;
      }
      onChange({ results, marks });
    },
    (error) => {
      if (onError) onError(error);
    }
  );
}

/** Only the fields the page shows, so nothing else KFin sends is kept. */
function slimResult(result) {
  return {
    state: result.state,
    at: result.at || Date.now(),
    rows: (result.rows || []).map((r) => ({
      name: r.name || null,
      application: r.application || null,
      applied: Number(r.applied || 0),
      allotted: Number(r.allotted || 0),
      category: r.category || null,
    })),
  };
}

async function write(uid, slug, pan, fields) {
  if (!uid || !slug || !PAN_SHAPE.test(pan || "")) return false;
  const db = await getDb();
  if (!db) return false;
  const { doc, serverTimestamp, setDoc } = await import("firebase/firestore");
  await setDoc(
    doc(db, "users", uid, "allotments", docId(slug, pan)),
    { pan, slug, ...fields, updatedAt: serverTimestamp() },
    { merge: true }
  );
  return true;
}

/** Stores KFin's answer. A transient one is ignored and reports false. */
export async function saveResult(uid, slug, pan, result) {
  if (!result || !STORED.has(result.state)) return false;
  return write(uid, slug, pan, { result: slimResult(result) });
}

/** Stores the reader's note; an empty outcome clears it. */
export async function saveMark(uid, slug, pan, outcome) {
  const { deleteField } = await import("firebase/firestore");
  return write(uid, slug, pan, {
    mark: MARKS.has(outcome) ? outcome : deleteField(),
  });
}

/** Every stored status for these PANs, gone — used when a PAN is removed. */
export async function removeAllotments(uid, pans) {
  if (!uid || !pans?.length) return;
  const db = await getDb();
  if (!db) return;
  const { collection, deleteDoc, getDocs, query, where } = await import(
    "firebase/firestore"
  );
  for (const pan of pans) {
    const snap = await getDocs(
      query(collection(db, "users", uid, "allotments"), where("pan", "==", pan))
    );
    for (const d of snap.docs) await deleteDoc(d.ref);
  }
}
