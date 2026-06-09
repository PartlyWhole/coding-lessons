import type { Loaded } from "../raw-types.js";
import type { GateIssue } from "./types.js";

const G = "7-golden";

// Golden snapshots would live on steps as `golden: { submission, expect: { attribution, misconceptionId? } }`.
// The corpus has none yet, and full Diagnosis production is M4. This gate scans for them and, when
// present, would re-grade via the dry-run grader (grade.ts) and diff. Until M4 wires the grader's
// attribution precedence, we emit an informational warn so the seam is visible but never red.
export function gateGolden(loaded: Loaded): GateIssue[] {
  let found = 0;
  for (const n of Object.values(loaded.nodes)) {
    for (const c of n.cells) {
      for (const s of c.steps) {
        if (s["golden"]) found++;
      }
    }
  }
  if (found === 0) {
    return [{ gate: G, level: "warn", message: "gate 7: no golden Diagnosis snapshots in corpus (skipped; plugs in at M4)" }];
  }
  return [{ gate: G, level: "warn", message: `gate 7: ${found} golden snapshot(s) found but re-grading lands at M4 (skipped)` }];
}
