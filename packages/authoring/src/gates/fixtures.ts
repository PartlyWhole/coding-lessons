// Ports content/verify/harness.py gate-5 loop (lines 274-291): for every misconception,
// every `triggers` fixture must FIRE its signature and every `notTriggers` fixture must NOT.
import type { Loaded } from "../raw-types.js";
import { signalsFor } from "../signals.js";
import { sigMatch } from "../signature.js";
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
        const got = sigMatch(sig, s);
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
