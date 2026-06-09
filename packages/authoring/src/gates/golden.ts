import type { Loaded, RawStep } from "../raw-types.js";
import { gradeBuild, type GradeResult } from "../grade.js";
import type { GateIssue } from "./types.js";

const G = "7-golden";

interface Golden {
  submission: string;
  expect: { attribution: string; misconceptionId?: string };
}

// `golden` is not a frozen-schema field (it's an authoring affordance), so it isn't
// covered by gate 1's schema validation — guard its shape here so a malformed snapshot
// produces a clear gate error instead of an uncaught TypeError.
function malformed(g: Golden): boolean {
  return typeof g.submission !== "string" || g.expect == null || typeof g.expect.attribution !== "string";
}

// §13.2 gate 7 — for every step carrying a `golden` snapshot, re-grade the recorded
// submission and diff attribution (+ misconceptionId) against the authored expectation.
// Build steps re-grade via the dry-run grader (grade.ts); non-build goldens are deferred
// (gradeBuild is build-only) and warn rather than error.
export function gateGolden(loaded: Loaded): GateIssue[] {
  const issues: GateIssue[] = [];
  let found = 0;

  for (const n of Object.values(loaded.nodes)) {
    for (const c of n.cells) {
      for (const st of c.steps as RawStep[]) {
        const golden = st["golden"] as Golden | undefined;
        if (!golden) continue;
        found++;

        if (malformed(golden)) {
          issues.push({ gate: G, level: "error", message: `gate 7: ${st.id} malformed golden — needs { submission: string, expect: { attribution: string, misconceptionId? } }` });
          continue;
        }

        if (st.kind !== "build") {
          issues.push({ gate: G, level: "warn", message: `gate 7: ${st.id} golden on a ${st.kind} step — non-build re-grade deferred (skipped)` });
          continue;
        }

        let got: GradeResult;
        try {
          got = gradeBuild(loaded, st.id, golden.submission);
        } catch (e) {
          issues.push({ gate: G, level: "error", message: `gate 7: ${st.id} golden failed to re-grade: ${(e as Error).message}` });
          continue;
        }

        if (got.attribution !== golden.expect.attribution) {
          issues.push({
            gate: G,
            level: "error",
            message: `gate 7: ${st.id} attribution drift — expected ${golden.expect.attribution}, got ${got.attribution}`,
          });
          continue;
        }
        const wantMid = golden.expect.misconceptionId;
        if (wantMid !== undefined && got.misconceptionId !== wantMid) {
          issues.push({
            gate: G,
            level: "error",
            message: `gate 7: ${st.id} misconceptionId drift — expected ${wantMid}, got ${got.misconceptionId ?? "(none)"}`,
          });
        }
      }
    }
  }

  if (found === 0) {
    return [{ gate: G, level: "warn", message: "gate 7: no golden Diagnosis snapshots in corpus (skipped; add `golden:` to a step to enable)" }];
  }
  return issues;
}
