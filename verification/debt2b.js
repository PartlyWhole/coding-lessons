// Debt 2b — property COUNTEREXAMPLE determinism under real Pyodide.
// The off-by-one randint fixture fails at the tests rung (property never runs), so this
// uses a submission that PASSES the authored tests but fails the seeded property:
// is_one(n) with a planted wrong branch at n == 3 (inside the generator range -5..5,
// outside the test inputs {1, 0, 2}).
import { createSandbox } from "../packages/sandbox/dist/src/sandbox.js";
import { browserWorkerFactory } from "../packages/sandbox/dist/src/browser-worker.js";
import { evaluate } from "../packages/engine/dist/src/index.js";

const WORKER_URL = new URL("../packages/sandbox/dist/src/pyodide-worker.js", import.meta.url);
const results = [];
const record = (name, pass, evidence) => results.push({ name, pass, evidence });

function findStepByEntrypoint(content, entry) {
  for (const node of Object.values(content.nodes)) {
    for (const cell of node.cells ?? []) {
      for (const st of cell.steps ?? []) {
        if (st.kind === "build" && st.evaluator?.run?.entrypoint === entry) return st;
      }
    }
  }
  throw new Error(`no build step with entrypoint ${entry}`);
}
function bundleFor(content, step) {
  const skills = {};
  const misconceptions = {};
  for (const sid of step.skills) {
    const s = content.skills[sid];
    if (!s) continue;
    skills[sid] = {
      id: s.id, title: s.title ?? sid, description: s.description ?? "",
      misconceptions: (s.misconceptions ?? []).map((m) => m.id), upstream: s.upstream ?? [],
    };
    for (const m of s.misconceptions ?? []) {
      misconceptions[m.id] = {
        ...m, skill: m.skill ?? m._skill,
        hintLadder: m.hintLadder ?? [], feedback: m.feedback ?? "", skillDeltas: m.skillDeltas ?? [],
      };
    }
  }
  return { contentVersion: "acceptance@1", skills, misconceptions, nodes: {}, cells: {}, producers: {}, requirements: {} };
}
const stripWallMs = (diag) => {
  const d = JSON.parse(JSON.stringify(diag));
  if (d.signals) d.signals.wallMs = 0;
  return d;
};

async function main() {
  const content = await (await fetch("./content-raw.json")).json();
  const sandbox = createSandbox({ workerFactory: browserWorkerFactory(WORKER_URL) });
  await sandbox.warmup();
  const fx = { id: "d", learnerId: "L", now: "2026-06-08T00:00:00.000Z" };

  const step = findStepByEntrypoint(content, "is_one");
  const bundle = bundleFor(content, step);
  const planted =
    'def is_one(n):\n    if n == 3:\n        return "match"\n    if n == 1:\n        return "match"\n    return "no match"';
  const runs = [];
  for (let i = 0; i < 3; i++) runs.push(await evaluate(step, { kind: "build", code: planted }, sandbox, bundle, fx));
  const [a, b, c] = runs;
  const ja = JSON.stringify(stripWallMs(a));
  const identical = ja === JSON.stringify(stripWallMs(b)) && ja === JSON.stringify(stripWallMs(c));
  record(
    "C1b-counterexample-determinism",
    identical && a.correct === false &&
      a.signals.tests?.failed === 0 && a.signals.property?.passed === false &&
      a.signals.property?.counterexample !== undefined &&
      JSON.stringify(a.signals.property) === JSON.stringify(b.signals.property) &&
      JSON.stringify(a.signals.property) === JSON.stringify(c.signals.property),
    {
      identicalModuloWallMs: identical,
      wallMsValues: runs.map((r) => r.signals.wallMs),
      testsSignal: a.signals.tests,
      property: a.signals.property,
      diagnosis: stripWallMs(a),
    },
  );

  sandbox.dispose();
  window.__DEBT2B_DONE__ = true;
  window.__DEBT2B_RESULTS__ = results;
}

main().catch((e) => {
  record("FATAL", false, { error: String(e), stack: e?.stack });
  window.__DEBT2B_DONE__ = true;
  window.__DEBT2B_RESULTS__ = results;
});
