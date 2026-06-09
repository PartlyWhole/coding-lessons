// Debt 4 — @trellis/persist nativeDriver against REAL browser IndexedDB.
// memoryDriver already proves the logic offline; this confirms the DOM driver:
// one real multi-store transaction, real abort/rollback, index round-trips,
// contentVersion cache, and the 4e8eca5 no-unhandled-rejection abort path.
import { nativeDriver } from "../packages/persist/dist/src/idb/native.js";
import { openTrellisDb } from "../packages/persist/dist/src/db.js";
import { commitSubmission } from "../packages/persist/dist/src/commitSubmission.js";
import { appendEvents, recentEvents } from "../packages/persist/dist/src/events.js";
import { loadBundle } from "../packages/persist/dist/src/contentCache.js";
import { STORES } from "../packages/persist/dist/src/schema.js";

const results = [];
const record = (name, pass, evidence) => {
  results.push({ name, pass, evidence });
  document.getElementById("log").textContent = `${results.length} checks done`;
};

// Track unhandled rejections for the whole session (the 4e8eca5 fix claim).
const unhandled = [];
window.addEventListener("unhandledrejection", (ev) => unhandled.push(String(ev.reason)));

const fixture = () => ({
  skillUpdates: [
    { skillId: "skill.output.print_literal", mastery: 0.6, attempts: 1, passes: 1, lastSeen: "2026-06-09T00:00:00Z", misconceptionCounts: {} },
  ],
  diagnosis: {
    id: "diag-1", learnerId: "L", stepId: "step-1", contentVersion: "v1",
    submittedAt: "2026-06-09T00:00:00Z", correct: true, attribution: "pass",
    signals: { ran: true, wallMs: 5 }, skillDeltas: [], seed: 0,
  },
  events: [
    { id: "evt-1", learnerId: "L", sessionId: "sess-1", seq: 0, stepId: "step-1", ts: "2026-06-09T00:00:00Z", type: "submission", payload: {} },
  ],
});

const readAllThree = (db) =>
  db.conn.tx(
    [STORES.learnerSkill, STORES.diagnosis, STORES.behavioralEvent],
    "readonly",
    async (tx) => [
      await tx.store(STORES.learnerSkill).getAll(),
      await tx.store(STORES.diagnosis).getAll(),
      await tx.store(STORES.behavioralEvent).getAll(),
    ],
  );

async function main() {
  // Fresh DB every run: delete any leftover from a previous harness run.
  await new Promise((res) => {
    const del = indexedDB.deleteDatabase("trellis");
    del.onsuccess = del.onerror = del.onblocked = () => res();
  });

  // ── 1. open against REAL IndexedDB; learnerId bootstrap persisted ──────
  const db = await openTrellisDb(nativeDriver());
  record("1-open-real-indexeddb", typeof db.learnerId === "string" && db.learnerId.length > 0, {
    learnerId: db.learnerId,
    driver: "nativeDriver(globalThis.indexedDB)",
  });

  // ── 2. atomic commitSubmission: 3 stores in ONE real transaction ───────
  await commitSubmission(db, fixture());
  const [s2, d2, e2] = await readAllThree(db);
  record("2-commit-three-stores-one-txn", s2.length === 1 && d2.length === 1 && e2.length === 1, {
    learner_skill: s2, diagnosis: d2.map((d) => d.id), behavioral_event: e2.map((e) => e.id),
  });

  // ── 3. forced mid-txn fault → real abort rolls back ALL THREE ──────────
  // Clean slate first, then commit where the diagnosis lacks its keyPath (`id`):
  // the put after a successful learner_skill put raises a REAL DataError inside
  // the native transaction, aborting it.
  await db.conn.tx([STORES.learnerSkill, STORES.diagnosis, STORES.behavioralEvent], "readwrite", async (tx) => {
    await tx.store(STORES.learnerSkill).delete("skill.output.print_literal");
    await tx.store(STORES.diagnosis).delete("diag-1");
    await tx.store(STORES.behavioralEvent).delete("evt-1");
  });
  const bad = fixture();
  delete bad.diagnosis.id; // violate diagnosis keyPath mid-transaction
  let thrown = null;
  try {
    await commitSubmission(db, bad);
  } catch (err) {
    thrown = String(err);
  }
  const [s3, d3, e3] = await readAllThree(db);
  record(
    "3-mid-txn-fault-rolls-back-all-three",
    thrown !== null && s3.length === 0 && d3.length === 0 && e3.length === 0,
    { thrown, learner_skill: s3.length, diagnosis: d3.length, behavioral_event: e3.length },
  );

  // ── 4. abort path produced no unhandled rejection (fix 4e8eca5) ────────
  await new Promise((res) => setTimeout(res, 250)); // let any stray rejection surface
  record("4-no-unhandled-rejection-on-abort", unhandled.length === 0, { unhandledRejections: unhandled });

  // ── 5. appendEvents / recentEvents round-trip (incl. by_step_ts index) ─
  const evts = [0, 1, 2, 3].map((i) => ({
    id: `evt-r${i}`, learnerId: "L", sessionId: "sess-1", seq: i,
    stepId: i < 3 ? "step-A" : "step-B", ts: `2026-06-09T00:00:0${i}Z`, type: "submission", payload: { i },
  }));
  await appendEvents(db, evts);
  const recentAll = await recentEvents(db, { limit: 10 });
  const recentA = await recentEvents(db, { stepId: "step-A", limit: 10 });
  record(
    "5-events-round-trip",
    recentAll.length === 4 && recentAll[0].id === "evt-r3" &&
      recentA.length === 3 && recentA.every((e) => e.stepId === "step-A") && recentA[0].id === "evt-r2",
    { newestFirstAll: recentAll.map((e) => e.id), stepAOnly: recentA.map((e) => e.id) },
  );

  // ── 6. contentVersion cache: hit then bust, against real IndexedDB ─────
  let fetches = 0;
  const countingFetch = (url) => { fetches++; return fetch(url); };
  const v1 = "ca-d29f760cf61a12e2";
  const b1 = await loadBundle(db, { url: "./bundle.json", contentVersion: v1, fetchImpl: countingFetch });
  const afterFirst = fetches;
  const b1again = await loadBundle(db, { url: "./bundle.json", contentVersion: v1, fetchImpl: countingFetch });
  const afterHit = fetches;
  const v2 = "ca-bust000000000000";
  const b2 = await loadBundle(db, { url: "./bundle2.json", contentVersion: v2, fetchImpl: countingFetch });
  const afterBust = fetches;
  record(
    "6-contentVersion-cache-hit-then-bust",
    afterFirst === 1 && afterHit === 1 && afterBust === 2 &&
      b1.contentVersion === v1 && b1again.contentVersion === v1 && b2.contentVersion === v2,
    { fetchesAfterFirst: afterFirst, fetchesAfterCacheHit: afterHit, fetchesAfterVersionChange: afterBust },
  );

  // ── 7. persistence across connection close + reopen (same page) ────────
  const learnerIdBefore = db.learnerId;
  db.close();
  const db2 = await openTrellisDb(nativeDriver());
  const recentAfterReopen = await recentEvents(db2, { limit: 10 });
  record(
    "7-close-reopen-data-survives",
    db2.learnerId === learnerIdBefore && recentAfterReopen.length === 4,
    { learnerIdStable: db2.learnerId === learnerIdBefore, eventsAfterReopen: recentAfterReopen.length },
  );
  db2.close();

  window.__DEBT4_DONE__ = true;
  window.__DEBT4_RESULTS__ = results;
}

main().catch((e) => {
  record("FATAL", false, { error: String(e), stack: e?.stack });
  window.__DEBT4_DONE__ = true;
  window.__DEBT4_RESULTS__ = results;
});
