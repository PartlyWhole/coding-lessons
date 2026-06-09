// Ports content/verify/harness.py signals_for/build_signals/owner_node_of/pick_step (lines 170-272).
import type { Loaded, RawFixture, RawMiscon, RawNode, RawStep } from "./raw-types.js";
import { evalTags, type TagQuery } from "./ast/matcher.js";
import { runCase, type CaseSpec } from "./ast/python.js";
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

/** harness.build_signals: AST tags (always) + run/test signals (only if the signature needs them). */
export function buildSignals(code: string, step: RawStep, needs: Set<string>): Signals {
  const ev = step["evaluator"] as Evaluator;
  const queries = ev.ast?.queries ?? [];
  const tags = evalTags(code, queries);
  const signals: Signals = { astTags: tags ?? new Set(), ran: tags !== null, runError: null, tests: null };
  if (tags === null) {
    signals.runError = { type: "syntax" };
    return signals;
  }
  const needsExec = ["runError", "testFailure", "propertyFailed"].some((k) => needs.has(k));
  if (!needsExec) return signals;

  const cases = ev.tests?.cases ?? [];
  const entry = ev.run?.entrypoint;
  const seed = ev.property?.seed;
  const failures: number[] = [];
  let runtimeErr: { type: "runtime" } | null = null;

  cases.forEach((c, i) => {
    const expected = c.expected;
    let spec: CaseSpec;
    if (entry !== undefined) {
      const inp = c.input;
      const args = Array.isArray(inp) ? inp : [inp];
      spec = { code, mode: "entrypoint", entry, args, expected, ...(seed !== undefined ? { seed } : {}) };
    } else {
      const inp = c.input;
      const stdin = inp == null ? null : typeof inp === "string" ? inp : String(inp);
      spec = { code, mode: "stdin", expected, stdin };
    }
    const r = runCase(spec);
    if (r.errType === "runtime") runtimeErr = { type: "runtime" };
    if (!r.ok) failures.push(i);
  });

  if (runtimeErr) signals.runError = runtimeErr;
  signals.tests = { failed: failures.length, failures };
  return signals;
}

/** harness.signals_for: compute signals for one fixture. */
export function signalsFor(fix: RawFixture, mis: RawMiscon, loaded: Loaded): Signals & { _error?: string } {
  if (fix.stepKind === "recognize" || fix.stepKind === "predict") {
    return fix.choice !== undefined ? { chosenChoiceId: fix.choice } : {};
  }
  if (fix.stepKind === "recall") {
    return fix.input !== undefined ? { recallInput: fix.input } : {};
  }
  if (fix.stepKind === "build") {
    const step = pickStep(loaded, mis, sigTags(mis.signature as Record<string, unknown>));
    if (step === null) return { _error: `no build step certifies ${mis._skill ?? mis.skill}` };
    return buildSignals(fix.code ?? "", step, sigKinds(mis.signature as Record<string, unknown>));
  }
  return { _error: `unknown stepKind ${fix.stepKind}` };
}
