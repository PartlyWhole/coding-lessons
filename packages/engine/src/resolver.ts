import type { Graph, LearnerModel, ConceptNode, Requirement } from "@trellis/schema";
import { DEFAULT_CONFIG, type EngineConfig } from "./config.js";

export type Availability = "locked" | "available" | "done";
export type AvailabilityMap = Record<string, Availability>;

// §4.3 — a requirement is met iff the skill exists and mastery >= threshold.
export function meets(model: LearnerModel, req: Requirement): boolean {
  const s = model.skills[req.skill];
  return s !== undefined && s.mastery >= req.minMastery;
}

// §4.3 — a node is done iff every skill it teaches is at/above the completion threshold.
export function completed(model: LearnerModel, node: ConceptNode, cfg: EngineConfig): boolean {
  if (node.teaches.length === 0) return false;
  return node.teaches.every((sk) => {
    const s = model.skills[sk];
    return s !== undefined && s.mastery >= cfg.completionThreshold;
  });
}

// §4.3 — full availability pass. Reads the materialized requirements index.
export function resolveAvailability(
  model: LearnerModel,
  graph: Graph,
  cfg: EngineConfig = DEFAULT_CONFIG,
): AvailabilityMap {
  const status: AvailabilityMap = {};
  for (const id of Object.keys(graph.nodes)) {
    const node = graph.nodes[id]!;
    status[id] = completed(model, node, cfg) ? "done" : "locked";
  }
  for (const id of Object.keys(graph.nodes)) {
    if (status[id] !== "locked") continue;
    const reqs = graph.requirements[id] ?? graph.nodes[id]!.requires;
    if (reqs.every((r) => meets(model, r))) status[id] = "available";
  }
  return status;
}

export interface UnmetRequirement {
  skill: string;
  minMastery: number;
  kind: Requirement["kind"];
  mastery: number;
}

// §4.3 "why locked" — the unmet requirements (with kind) for a node, for UI explanation.
export function whyLocked(
  model: LearnerModel,
  graph: Graph,
  nodeId: string,
): UnmetRequirement[] {
  const reqs = graph.requirements[nodeId] ?? graph.nodes[nodeId]?.requires ?? [];
  return reqs
    .filter((r) => !meets(model, r))
    .map((r) => ({
      skill: r.skill,
      minMastery: r.minMastery,
      kind: r.kind,
      mastery: model.skills[r.skill]?.mastery ?? 0,
    }));
}
