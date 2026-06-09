// Debt 3 — the M4 mis.loop.infinite_true { timedOut: true } re-key, verified END-TO-END
// against the REAL Pyodide watchdog (the discrimination the offline harness can't model):
// signals are assembled by assembleBuildSignals over genuinely non-terminating submissions
// that the real worker.terminate() kills, then live detect() attributes them.
import { createSandbox } from "../packages/sandbox/dist/src/sandbox.js";
import { browserWorkerFactory } from "../packages/sandbox/dist/src/browser-worker.js";
import { assembleBuildSignals, detect, evaluate } from "../packages/engine/dist/src/index.js";

const WORKER_URL = new URL("../packages/sandbox/dist/src/pyodide-worker.js", import.meta.url);
const results = [];
const record = (name, pass, evidence) => results.push({ name, pass, evidence });

function findStep(content, stepId) {
  for (const node of Object.values(content.nodes)) {
    for (const cell of node.cells ?? []) {
      for (const st of cell.steps ?? []) if (st.id === stepId) return st;
    }
  }
  throw new Error(`step ${stepId} not found`);
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
  return { contentVersion: "debt3@1", skills, misconceptions, nodes: {}, cells: {}, producers: {}, requirements: {} };
}

async function main() {
  const content = await (await fetch("./content-raw.json")).json();
  const sandbox = createSandbox({ workerFactory: browserWorkerFactory(WORKER_URL) });
  await sandbox.warmup();
  // The guessing-game capstone: skills [skill.loop.termination, skill.loop.while],
  // AST queries for BOTH infinite_true_no_break and while_cond_no_update.
  const step = findStep(content, "cell.loops.guessing_game#5");
  const bundle = bundleFor(content, step);
  record("0-rekeyed-signature-in-bundle", JSON.stringify(bundle.misconceptions["mis.loop.infinite_true"].signature.any[0]) === '{"timedOut":true}', {
    signature: bundle.misconceptions["mis.loop.infinite_true"].signature,
    stepSkills: step.skills,
  });

  // ── 1. A genuine `while True:` (no break) the real watchdog kills →
  //       live detect() attributes mis.loop.infinite_true ───────────────────
  const trueLoop = "import random\nrandom.seed(42)\nnumber = random.randint(1, 100)\nwhile True:\n    pass";
  const s1 = await assembleBuildSignals(step, trueLoop, sandbox);
  const w1 = detect(step, { signals: s1 }, bundle);
  record(
    "1-while-true-watchdog-kill-attributes-infinite_true",
    s1.ran === false && s1.timedOut === true && w1 === "mis.loop.infinite_true",
    { signals: s1, detectWinner: w1 },
  );

  // ── 2. The timedOut branch ALONE (no structural tag fires): a non-True
  //       condition, body assigns but diverges → only timedOut matches ──────
  const diverging = "n = 0\nwhile n < 10:\n    n = n - 1";
  const s2 = await assembleBuildSignals(step, diverging, sandbox);
  const w2 = detect(step, { signals: s2 }, bundle);
  record(
    "2-bare-timeout-no-structural-tags-attributes-infinite_true",
    s2.ran === false && s2.timedOut === true && (s2.astTags ?? []).length === 0 && w2 === "mis.loop.infinite_true",
    { signals: s2, detectWinner: w2 },
  );

  // ── 3. THE discrimination: a never-updating `while cond:` ALSO times out,
  //       infinite_true's timedOut branch matches (rank 2) — but structural
  //       mis.loop.no_update (rank 0) WINS §7 matchedSpecificity ────────────
  const noUpdate = "guess = 0\nnumber = 82\nwhile guess != number:\n    print(\"forever\")";
  const s3 = await assembleBuildSignals(step, noUpdate, sandbox);
  const w3 = detect(step, { signals: s3 }, bundle);
  record(
    "3-no_update-shaped-timeout-loses-to-structural-no_update",
    s3.timedOut === true && (s3.astTags ?? []).includes("while_cond_no_update") && w3 === "mis.loop.no_update",
    { signals: { ...s3, astTags: s3.astTags }, detectWinner: w3, infiniteTrueLost: w3 !== "mis.loop.infinite_true" },
  );

  // ── 4. ROUTING GAP DOCUMENTATION (escalation evidence, engine-owned):
  //       the live evaluate() ladder maps !ran→attribution "runtime"/"syntax"
  //       WITHOUT calling detect(), so a watchdog-killed run never surfaces
  //       misconceptionId through evaluate — only via detect() directly. ──
  const fx = { id: "d", learnerId: "L", now: "2026-06-08T00:00:00.000Z" };
  const d4 = await evaluate(step, { kind: "build", code: trueLoop }, sandbox, bundle, fx);
  record(
    "4-evaluate-routing-gap-documented",
    null /* observational: evidence for the engine escalation */,
    {
      attribution: d4.attribution,
      misconceptionId: d4.misconceptionId ?? null,
      timedOutSignal: d4.signals.timedOut ?? false,
      note: "evaluate() does not route !ran/timedOut through detect(); detect() itself attributes correctly (checks 1-3)",
    },
  );

  sandbox.dispose();
  window.__DEBT3_DONE__ = true;
  window.__DEBT3_RESULTS__ = results;
}

main().catch((e) => {
  record("FATAL", false, { error: String(e), stack: e?.stack });
  window.__DEBT3_DONE__ = true;
  window.__DEBT3_RESULTS__ = results;
});
