import type { Loaded } from "../raw-types.js";
import { buildProducers } from "../indexes.js";
import type { GateIssue } from "../gates/types.js";

const G = "lint-spine-extension";

export function lintSpineExtension(loaded: Loaded): GateIssue[] {
  const issues: GateIssue[] = [];
  const producers = buildProducers(loaded);
  const trackOf = (nid: string) => loaded.nodes[nid]?.track;

  for (const [nid, n] of Object.entries(loaded.nodes)) {
    if (n.track !== "spine") continue;
    for (const r of n.requires ?? []) {
      const prod = producers[r.skill] ?? [];
      const spineProducers = prod.filter((p) => trackOf(p) === "spine");
      if (prod.length > 0 && spineProducers.length === 0) {
        issues.push({
          gate: G,
          level: "error",
          message: `spine node ${nid} requires ${r.skill}, which only extension node(s) ${prod.join(", ")} teach (spine must not depend on an extension)`,
        });
      }
    }
  }
  return issues;
}
