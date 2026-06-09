// Debt 2 — M3b: 21-fixture differential + live evaluate ladder + determinism,
// with REAL Pyodide as the executor (parseAndMatch runs Python `ast` IN the worker).
// Mirrors packages/sandbox/test/differential.test.ts + acceptance.test.ts, but the
// sandbox is the real Pyodide Web Worker host instead of the local-CPython twin.
import { createSandbox } from "../packages/sandbox/dist/src/sandbox.js";
import { browserWorkerFactory } from "../packages/sandbox/dist/src/browser-worker.js";
import {
  evaluate,
  assembleBuildSignals,
  evalSignature,
} from "../packages/engine/dist/src/index.js";

const WORKER_URL = new URL("../packages/sandbox/dist/src/pyodide-worker.js", import.meta.url);
const logEl = document.getElementById("log");
const results = [];
function record(name, pass, evidence) {
  results.push({ name, pass, evidence });
  logEl.textContent = `${results.length} checks done`;
}

// ── ports of packages/sandbox/test/_fixtures.ts (browser-safe) ──────────────
function sigTags(sig, acc = new Set()) {
  for (const k of ["all", "any"]) if (sig[k]) for (const s of sig[k]) sigTags(s, acc);
  if (sig.not) sigTags(sig.not, acc);
  if (sig.astTag) acc.add(sig.astTag);
  return acc;
}
function pickBuildStep(content, mis) {
  const skillId = mis._skill;
  const ownerNode = Object.values(content.nodes).find((n) => (n.teaches ?? []).includes(skillId));
  const cands = [];
  const collect = (node) => {
    for (const c of node?.cells ?? []) {
      const touch = new Set(c.certifies ?? []);
      for (const st of c.steps ?? []) {
        if (st.kind === "build" && (new Set(st.skills ?? []).has(skillId) || touch.has(skillId))) cands.push(st);
      }
    }
  };
  if (ownerNode) collect(ownerNode);
  if (cands.length === 0) for (const n of Object.values(content.nodes)) collect(n);
  const needed = sigTags(mis.signature);
  if (needed.size > 0) {
    for (const st of cands) {
      const tags = new Set((st.evaluator?.ast?.queries ?? []).map((q) => q.tag));
      if ([...needed].every((t) => tags.has(t))) return st;
    }
  }
  return cands[0] ?? null;
}
// ── ports of packages/sandbox/test/acceptance.test.ts helpers ───────────────
function findStep(content, stepId) {
  for (const node of Object.values(content.nodes)) {
    for (const cell of node.cells ?? []) {
      for (const st of cell.steps ?? []) if (st.id === stepId) return st;
    }
  }
  throw new Error(`build step ${stepId} not found`);
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

  // Pyodide runtime version (for the version-skew watch vs local CPython twin)
  const pyver = await sandbox.run({ code: "import sys\nprint(sys.version)", timeoutMs: 10000, memoryMb: 256 });
  record("0-pyodide-python-version", true, { pyodidePython: pyver.stdout.trim() });

  // ── A. 21-fixture differential (real Pyodide as executor) ─────────────────
  const buildBearing = Object.values(content.miscons).filter((m) =>
    [...(m.triggers ?? []), ...(m.notTriggers ?? [])].some((f) => f.stepKind === "build"),
  );
  let fixturesRun = 0;
  let fixturesAgree = 0;
  const perFixture = [];
  for (const mis of buildBearing) {
    const step = pickBuildStep(content, mis);
    if (!step) {
      perFixture.push({ mis: mis.id, error: "no build step surfaces this misconception" });
      continue;
    }
    for (const [label, want] of [["triggers", true], ["notTriggers", false]]) {
      for (const fix of mis[label] ?? []) {
        if (fix.stepKind !== "build") continue;
        fixturesRun++;
        const signals = await assembleBuildSignals(step, fix.code, sandbox);
        const got = evalSignature(mis.signature, { signals });
        const agree = got === want;
        if (agree) fixturesAgree++;
        perFixture.push({ mis: mis.id, label, want, got, agree, ...(agree ? {} : { code: fix.code, signals }) });
      }
    }
  }
  record(
    "A-21-fixture-differential",
    fixturesRun > 0 && fixturesAgree === fixturesRun,
    { buildBearingMisconceptions: buildBearing.length, fixturesRun, fixturesAgree, perFixture },
  );

  // ── B. §4 acceptance: live ladder end-to-end ──────────────────────────────
  const stepConcat = findStep(content, "cell.string_concat.text_plus_number#4");
  const bundleConcat = bundleFor(content, stepConcat);
  const fstr = await evaluate(stepConcat, { kind: "build", code: 'def announce(number):\n    return f"Your random number is: {number}"' }, sandbox, bundleConcat, fx);
  const coerce = await evaluate(stepConcat, { kind: "build", code: 'def announce(number):\n    return "Your random number is: " + str(number)' }, sandbox, bundleConcat, fx);
  const bad = await evaluate(stepConcat, { kind: "build", code: 'def announce(number):\n    return "Your random number is: " + number' }, sandbox, bundleConcat, fx);
  record(
    "B-section4-acceptance",
    fstr.correct === true && fstr.attribution === "pass" &&
      coerce.correct === true && coerce.attribution === "pass" &&
      bad.correct === false && bad.attribution === "misconception" && bad.misconceptionId === "mis.concat.str_num",
    { fstr: stripWallMs(fstr), coerce: stripWallMs(coerce), bad: stripWallMs(bad) },
  );

  // ── C. Determinism: byte-identical Diagnosis (modulo measured wallMs) ─────
  // C1: seeded property failure (off-by-one randint) — counterexample identity.
  const stepRand = findStep(content, "cell.random.build#2");
  const bundleRand = bundleFor(content, stepRand);
  const offByOne = "import random\n\ndef get_random(a, b):\n    return random.randint(a, b - 1)";
  const d1 = await evaluate(stepRand, { kind: "build", code: offByOne }, sandbox, bundleRand, fx);
  const d2 = await evaluate(stepRand, { kind: "build", code: offByOne }, sandbox, bundleRand, fx);
  const d3 = await evaluate(stepRand, { kind: "build", code: offByOne }, sandbox, bundleRand, fx);
  const j1 = JSON.stringify(stripWallMs(d1)), j2 = JSON.stringify(stripWallMs(d2)), j3 = JSON.stringify(stripWallMs(d3));
  record(
    "C1-determinism-seeded-property",
    j1 === j2 && j2 === j3 && d1.correct === false &&
      d1.signals.property?.counterexample !== undefined &&
      JSON.stringify(d1.signals.property) === JSON.stringify(d2.signals.property),
    {
      identicalModuloWallMs: j1 === j2 && j2 === j3,
      wallMsValues: [d1.signals.wallMs, d2.signals.wallMs, d3.signals.wallMs],
      counterexample: d1.signals.property?.counterexample,
      diagnosis: stripWallMs(d1),
    },
  );
  // C2: a correct randint solution passes under the seed.
  const good = "import random\n\ndef get_random(a, b):\n    return random.randint(a, b)";
  const dGood = await evaluate(stepRand, { kind: "build", code: good }, sandbox, bundleRand, fx);
  record("C2-correct-property-passes", dGood.correct === true && dGood.attribution === "pass", stripWallMs(dGood));

  // C3: parseAndMatch (real Python ast in the worker) is deterministic + correct.
  const queries = stepConcat.evaluator.ast.queries;
  const t1 = await sandbox.parseAndMatch('def announce(n):\n    return "x: " + n', queries);
  const t2 = await sandbox.parseAndMatch('def announce(n):\n    return "x: " + n', queries);
  record("C3-parseAndMatch-deterministic", JSON.stringify(t1) === JSON.stringify(t2), { tags: t1, queryTags: queries.map((q) => q.tag) });

  sandbox.dispose();
  window.__DEBT2_DONE__ = true;
  window.__DEBT2_RESULTS__ = results;
}

main().catch((e) => {
  record("FATAL", false, { error: String(e), stack: e?.stack });
  window.__DEBT2_DONE__ = true;
  window.__DEBT2_RESULTS__ = results;
});
