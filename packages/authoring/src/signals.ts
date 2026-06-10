// Ports content/verify/harness.py signals_for/build_signals/owner_node_of/pick_step (lines 170-272).
import type { Loaded, RawFixture, RawMiscon, RawNode, RawStep } from "./raw-types.js";
import { evalTags, type TagQuery } from "./ast/matcher.js";
import { runCases, type CaseSpec, type CaseResult } from "./ast/python.js";
import { sigKinds, sigTags, type Signals } from "./signature.js";

function ownerNodeOf(loaded: Loaded, skillId: string): RawNode | null {
  for (const n of Object.values(loaded.nodes)) if ((n.teaches ?? []).includes(skillId)) return n;
  return null;
}

function buildStepsForSkill(loaded: Loaded, skillId: string): RawStep[] {
  const out: RawStep[] = [];
  for (const n of Object.values(loaded.nodes)) {
    for (const c of n.cells) {
      const certifies = new Set(c.certifies ?? []);
      for (const st of c.steps) {
        if (st.kind === "build") {
          const skills = new Set((st["skills"] as string[] | undefined) ?? []);
          if (skills.has(skillId) || certifies.has(skillId)) out.push(st);
        }
      }
    }
  }
  return out;
}

/** The build step that would surface this misconception (harness.pick_step). */
function pickStep(loaded: Loaded, mis: RawMiscon, neededTags: Set<string>): RawStep | null {
  const skillId = mis._skill ?? mis.skill;
  const node = ownerNodeOf(loaded, skillId);
  let cands: RawStep[] = [];
  if (node) {
    for (const c of node.cells) {
      const touch = new Set(c.certifies ?? []);
      for (const st of c.steps) {
        if (st.kind === "build") {
          const skills = new Set((st["skills"] as string[] | undefined) ?? []);
          if (skills.has(skillId) || touch.has(skillId)) cands.push(st);
        }
      }
    }
  }
  if (cands.length === 0) cands = buildStepsForSkill(loaded, skillId);
  if (neededTags.size > 0) {
    for (const st of cands) {
      const ev = st["evaluator"] as { ast?: { queries?: TagQuery[] } } | undefined;
      const tags = new Set((ev?.ast?.queries ?? []).map((q) => q.tag));
      if ([...neededTags].every((t) => tags.has(t))) return st;
    }
  }
  return cands[0] ?? null;
}

interface Evaluator {
  ast?: { queries?: TagQuery[] };
  tests?: { cases?: { input?: unknown; expected?: unknown }[] };
  run?: { entrypoint?: string };
  property?: { seed?: number };
}

/** The exec work a build fixture WOULD need (collect phase of the two-phase split). */
export interface BuildExecPlan {
  needsExec: boolean;
  bareSpec?: CaseSpec;
  caseSpecs?: CaseSpec[];
}

/** Phase A of buildSignals: AST tags + the exec specs this fixture WOULD need. Pure
 * (no python spawn beyond the AST parse) — callers batch the specs corpus-wide. */
export function planBuildSignals(
  code: string,
  step: RawStep,
  needs: Set<string>,
): { signals: Signals; plan: BuildExecPlan } {
  const ev = step["evaluator"] as Evaluator;
  const queries = ev.ast?.queries ?? [];
  const tags = evalTags(code, queries);
  const signals: Signals = { astTags: tags ?? new Set(), ran: tags !== null, runError: null, tests: null };
  if (tags === null) {
    signals.runError = { type: "syntax" };
    return { signals, plan: { needsExec: false } };
  }
  // `timedOut` is a run-dependent signal too (harness.py lockstep: the watchdog can
  // only fire on a run).
  const needsExec = ["runError", "testFailure", "propertyFailed", "timedOut"].some((k) => needs.has(k));
  if (!needsExec) return { signals, plan: { needsExec: false } };

  const cases = ev.tests?.cases ?? [];
  const entry = ev.run?.entrypoint;
  const seed = ev.property?.seed;
  const caseSpecs: CaseSpec[] = cases.map((c) => {
    const expected = c.expected;
    if (entry !== undefined) {
      const inp = c.input;
      const args = Array.isArray(inp) ? inp : [inp];
      return { code, mode: "entrypoint", entry, args, expected, ...(seed !== undefined ? { seed } : {}) };
    }
    const inp = c.input;
    const stdin = inp == null ? null : typeof inp === "string" ? inp : String(inp);
    return { code, mode: "stdin", expected, stdin };
  });
  return { signals, plan: { needsExec: true, bareSpec: { code, mode: "bare" }, caseSpecs } };
}

/** Phase B of buildSignals: assemble final signals from executed results. Pure.
 * E-15 (harness.py lockstep): mirror engine assembleBuildSignals step 2 — a bare
 * input-free run the watchdog kills carries timedOut and NO test results (the engine
 * short-circuits before the test runner). A module-level runtime fault keeps ran=true
 * in the worker harness and falls through to the per-case runs, exactly as the engine
 * proceeds to runTests. */
export function finishBuildSignals(
  signals: Signals,
  bare: CaseResult,
  caseResults: CaseResult[],
): Signals {
  if (bare.errType === "timeout") {
    signals.ran = false;
    signals.timedOut = true;
    return signals;
  }

  const failures: number[] = [];
  let runtimeErr: { type: "runtime" } | null = null;

  caseResults.forEach((r, i) => {
    if (r.errType === "runtime") runtimeErr = { type: "runtime" };
    // E-15: a PER-CASE watchdog kill maps to a runtime runError + a failed case (engine
    // testRunner.ts: res.timedOut -> runError ??= {type:"runtime"}); the timedOut signal
    // is bare-run-only, exactly as in assembleBuildSignals.
    if (r.errType === "timeout") runtimeErr = runtimeErr ?? { type: "runtime" };
    if (!r.ok) failures.push(i);
  });

  if (runtimeErr) signals.runError = runtimeErr;
  signals.tests = { failed: failures.length, failures };
  return signals;
}

/** harness.build_signals: AST tags (always) + run/test signals (only if the signature
 * needs them). Unchanged public contract; now plan -> execute -> finish. */
export function buildSignals(code: string, step: RawStep, needs: Set<string>): Signals {
  const { signals, plan } = planBuildSignals(code, step, needs);
  if (!plan.needsExec) return signals;
  const bare = runCases([plan.bareSpec!])[0]!;
  if (bare.errType === "timeout") return finishBuildSignals(signals, bare, []);
  return finishBuildSignals(signals, bare, runCases(plan.caseSpecs!));
}

/** The picked step + unioned signal-needs for a build fixture's misconception
 * (extracted verbatim from signalsFor so gate 5 can plan without executing): the
 * signal-needs set is unioned across ALL candidate misconceptions of the step's
 * skills, because the live engine always assembles the full RawSignals and
 * detect-winner must see what every candidate would see (harness.py lockstep). */
export function buildFixtureContext(
  mis: RawMiscon,
  loaded: Loaded,
): { step: RawStep | null; needs: Set<string> } {
  const step = pickStep(loaded, mis, sigTags(mis.signature as Record<string, unknown>));
  if (step === null) return { step: null, needs: new Set() };
  const needs = sigKinds(mis.signature as Record<string, unknown>);
  for (const sk of (step["skills"] as string[] | undefined) ?? []) {
    for (const m of loaded.skills[sk]?.misconceptions ?? []) {
      for (const k of sigKinds(m.signature as Record<string, unknown>)) needs.add(k);
    }
  }
  return { step, needs };
}

/** harness.signals_for: compute signals for one fixture. For build fixtures the
 * returned signals carry `_step` (the picked step) so gate 5 can judge §7 ATTRIBUTION
 * (E-16). */
export function signalsFor(
  fix: RawFixture,
  mis: RawMiscon,
  loaded: Loaded,
): Signals & { _error?: string; _step?: RawStep } {
  if (fix.stepKind === "recognize" || fix.stepKind === "predict") {
    return fix.choice !== undefined ? { chosenChoiceId: fix.choice } : {};
  }
  if (fix.stepKind === "recall") {
    return fix.input !== undefined ? { recallInput: fix.input } : {};
  }
  if (fix.stepKind === "build") {
    const { step, needs } = buildFixtureContext(mis, loaded);
    if (step === null) return { _error: `no build step certifies ${mis._skill ?? mis.skill}` };
    const signals: Signals & { _step?: RawStep } = buildSignals(fix.code ?? "", step, needs);
    signals._step = step;
    return signals;
  }
  return { _error: `unknown stepKind ${fix.stepKind}` };
}
