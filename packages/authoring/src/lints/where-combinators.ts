import type { Loaded } from "../raw-types.js";
import type { GateIssue } from "../gates/types.js";

const G = "lint-where";
const COMBINATORS = ["not", "all", "any"];

function scanQuery(q: unknown, path: string, push: (m: string) => void): void {
  if (!q || typeof q !== "object") return;
  const obj = q as Record<string, unknown>;
  if (obj["where"] && typeof obj["where"] === "object") {
    for (const k of COMBINATORS) {
      if (k in (obj["where"] as object)) push(`${path}: \`where\` contains forbidden combinator \`${k}\` (§6.3: not/all/any live only at the AstQuery level)`);
    }
    const cm = (obj["where"] as Record<string, unknown>)["childMatches"];
    if (cm) scanQuery(cm, `${path}.where.childMatches`, push);
  }
  for (const k of ["within", "not"]) if (obj[k]) scanQuery(obj[k], `${path}.${k}`, push);
  if (obj["field"]) for (const [f, sub] of Object.entries(obj["field"] as object)) scanQuery(sub, `${path}.field.${f}`, push);
  for (const k of ["all", "any"]) if (Array.isArray(obj[k])) (obj[k] as unknown[]).forEach((s, i) => scanQuery(s, `${path}.${k}[${i}]`, push));
}

export function lintWhereCombinators(loaded: Loaded): GateIssue[] {
  const issues: GateIssue[] = [];
  const push = (message: string) => issues.push({ gate: G, level: "error", message });
  for (const n of Object.values(loaded.nodes)) {
    for (const c of n.cells) {
      for (const s of c.steps) {
        const ev = s["evaluator"] as { ast?: { queries?: { tag: string; query: unknown }[] }; acceptedVariants?: { astQuery: unknown }[] } | undefined;
        for (const q of ev?.ast?.queries ?? []) scanQuery(q.query, `${s.id} ast[${q.tag}]`, push);
        for (const v of ev?.acceptedVariants ?? []) scanQuery(v.astQuery, `${s.id} acceptedVariant`, push);
      }
    }
  }
  return issues;
}
