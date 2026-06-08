import type { Loaded } from "./raw-types.js";
import type { Producers, Requirements, Requirement } from "@trellis/schema";

/** skill -> nodes that teach it (§4.1). Sorted by node id for a deterministic bundle. */
export function buildProducers(loaded: Loaded): Producers {
  const producers: Producers = {};
  for (const nid of Object.keys(loaded.nodes).sort()) {
    for (const sk of loaded.nodes[nid]!.teaches ?? []) {
      (producers[sk] ??= []).push(nid);
    }
  }
  for (const sk of Object.keys(producers)) producers[sk]!.sort();
  return producers;
}

/** node -> requires, deduped by skill keeping the strictest minMastery (§4.1 "flattened, deduped"). */
export function buildRequirements(loaded: Loaded): Requirements {
  const out: Requirements = {};
  for (const nid of Object.keys(loaded.nodes)) {
    const bySkill = new Map<string, Requirement>();
    for (const r of loaded.nodes[nid]!.requires ?? []) {
      const prev = bySkill.get(r.skill);
      if (!prev || r.minMastery > prev.minMastery) {
        bySkill.set(r.skill, { skill: r.skill, minMastery: r.minMastery, kind: r.kind });
      }
    }
    out[nid] = [...bySkill.values()];
  }
  return out;
}
