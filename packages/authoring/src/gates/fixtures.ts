// Ports content/verify/harness.py's gate-5 loop in ATTRIBUTION mode (E-16, matching the
// harness since the D3 re-key a4fb601): BUILD fixtures assert §7 attribution — the
// misconception must WIN (trigger) or NOT WIN (notTrigger) the specificity-ranked
// first-match among all candidate misconceptions of the step's skills (detectWinner
// mirrors engine detect()). Non-build fixtures stay isolated signature matches
// (choice ids are step-local).
import type { Loaded } from "../raw-types.js";
import { signalsFor } from "../signals.js";
import { sigMatch } from "../signature.js";
import { detectWinner } from "../detect.js";
import type { GateIssue } from "./types.js";

const G = "5-fixtures";

export function gateFixtures(loaded: Loaded): GateIssue[] {
  const issues: GateIssue[] = [];
  for (const mid of Object.keys(loaded.miscons).sort()) {
    const m = loaded.miscons[mid]!;
    const sig = m.signature as Record<string, unknown>;
    for (const [label, want] of [["triggers", true], ["notTriggers", false]] as const) {
      for (const fix of m[label] ?? []) {
        const s = signalsFor(fix, m, loaded);
        if (s._error) {
          issues.push({ gate: G, level: "error", message: `${mid}: ${s._error}` });
          continue;
        }
        const step = s._step;
        const got = step !== undefined ? detectWinner(loaded, step, s) === mid : sigMatch(sig, s);
        if (got !== want) {
          const what = fix.code ?? fix.choice ?? fix.input;
          issues.push({
            gate: G,
            level: "error",
            message: `${mid}: ${label} ${JSON.stringify(what)} want=${want} got=${got}`,
          });
        }
      }
    }
  }
  return issues;
}
