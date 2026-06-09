// trellis grade <step> <file> — dry-run a build submission against a step's evaluator and report
// attribution + the matched misconception (§13.3 v1 authoring affordance). Self-contained: reuses
// Task 6's signal computation + signature matcher; does NOT import @trellis/engine.
import type { Loaded, RawStep, RawMiscon } from "./raw-types.js";
import { buildSignals } from "./signals.js";
import { sigMatch, sigKinds, type Signals } from "./signature.js";

export interface GradeResult {
  stepId: string;
  attribution: "pass" | "misconception" | "syntax" | "runtime" | "mismatch";
  misconceptionId?: string;
  signals: Signals;
}

function findStep(
  loaded: Loaded,
  stepId: string,
): { step: RawStep; skills: string[]; certifies: string[] } | null {
  for (const n of Object.values(loaded.nodes)) {
    for (const c of n.cells) {
      for (const st of c.steps) {
        if (st.id === stepId) {
          return { step: st, skills: (st["skills"] as string[] | undefined) ?? [], certifies: c.certifies ?? [] };
        }
      }
    }
  }
  return null;
}

export function gradeBuild(loaded: Loaded, stepId: string, submission: string): GradeResult {
  const found = findStep(loaded, stepId);
  if (!found) throw new Error(`unknown step ${stepId}`);
  if (found.step.kind !== "build") {
    throw new Error(`grade supports build steps only; ${stepId} is ${found.step.kind}`);
  }

  const skillSet = new Set([...found.skills, ...found.certifies]);
  const candidates: RawMiscon[] = Object.values(loaded.miscons).filter((m) => skillSet.has(m.skill));

  const needs = new Set<string>();
  for (const m of candidates) for (const k of sigKinds(m.signature as Record<string, unknown>)) needs.add(k);
  needs.add("testFailure");
  needs.add("runError");

  const signals = buildSignals(submission, found.step, needs);

  if (signals.runError?.type === "syntax") return { stepId, attribution: "syntax", signals };

  for (const m of candidates.slice().sort((a, b) => a.id.localeCompare(b.id))) {
    if (sigMatch(m.signature as Record<string, unknown>, signals)) {
      return { stepId, attribution: "misconception", misconceptionId: m.id, signals };
    }
  }

  if (signals.runError?.type === "runtime") return { stepId, attribution: "runtime", signals };
  if (signals.tests && signals.tests.failed > 0) return { stepId, attribution: "mismatch", signals };
  return { stepId, attribution: "pass", signals };
}
