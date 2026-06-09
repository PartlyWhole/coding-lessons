import type { Loaded } from "../raw-types.js";
import type { GateIssue } from "./types.js";

const G = "4-granularity";

export function gateGranularity(loaded: Loaded): GateIssue[] {
  const issues: GateIssue[] = [];
  const { skills, miscons } = loaded;

  const count: Record<string, number> = {};
  for (const m of Object.values(miscons)) count[m.skill] = (count[m.skill] ?? 0) + 1;

  for (const sid of Object.keys(skills)) {
    const c = count[sid] ?? 0;
    if (c === 0) issues.push({ gate: G, level: "error", message: `granularity: skill ${sid} has 0 misconceptions (merge or add one)` });
    else if (c > 6) issues.push({ gate: G, level: "warn", message: `granularity: skill ${sid} has ${c} misconceptions (>6, consider split)` });
  }

  return issues;
}
