import type { Loaded } from "../raw-types.js";
import type { GateIssue } from "../gates/types.js";

const G = "lint-re2";

const BACKREF = /\\[1-9]/;
const LOOKAROUND = /\(\?<?[=!]/;

export function lintRe2Patterns(loaded: Loaded): GateIssue[] {
  const issues: GateIssue[] = [];
  const push = (message: string) => issues.push({ gate: G, level: "error", message });
  for (const n of Object.values(loaded.nodes)) {
    for (const c of n.cells) {
      for (const s of c.steps) {
        const acc = (s["accepted"] as { patterns?: string[] }) ?? {};
        const exp = (s["expected"] as { patterns?: string[] }) ?? {};
        for (const p of [...(acc.patterns ?? []), ...(exp.patterns ?? [])]) {
          if (BACKREF.test(p)) push(`${s.id}: pattern ${JSON.stringify(p)} uses a backreference (RE2-incompatible)`);
          else if (LOOKAROUND.test(p)) push(`${s.id}: pattern ${JSON.stringify(p)} uses lookaround (RE2-incompatible)`);
          else { try { new RegExp(p); } catch { push(`${s.id}: pattern ${JSON.stringify(p)} does not compile`); } }
        }
      }
    }
  }
  return issues;
}
