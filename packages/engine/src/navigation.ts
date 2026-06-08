import type { Graph, LearnerModel } from "@trellis/schema";
import { DEFAULT_CONFIG, type EngineConfig } from "./config.js";
import { resolveAvailability, type AvailabilityMap } from "./resolver.js";

// §4.3 — order spine nodes by prerequisite depth. Edge p→n when a spine producer p
// teaches a skill that spine node n requires. Kahn's algorithm with sorted queues so
// the output is deterministic (ties broken by id). Extensions are excluded; the
// "ordinal" the design references is this topological position.
export function spineOrder(graph: Graph): string[] {
  const spine = Object.keys(graph.nodes)
    .filter((id) => graph.nodes[id]!.track === "spine")
    .sort();
  const spineSet = new Set(spine);

  const indeg: Record<string, number> = {};
  const adj: Record<string, string[]> = {};
  for (const id of spine) {
    indeg[id] = 0;
    adj[id] = [];
  }
  for (const id of spine) {
    const reqs = graph.requirements[id] ?? graph.nodes[id]!.requires;
    const preds = new Set<string>();
    for (const r of reqs) {
      for (const p of graph.producers[r.skill] ?? []) {
        if (spineSet.has(p) && p !== id) preds.add(p);
      }
    }
    for (const p of preds) {
      adj[p]!.push(id);
      indeg[id]!++;
    }
  }

  const queue = spine.filter((id) => indeg[id] === 0).sort();
  const order: string[] = [];
  while (queue.length > 0) {
    const id = queue.shift()!;
    order.push(id);
    for (const m of adj[id]!) {
      indeg[m]!--;
      if (indeg[m] === 0) {
        queue.push(m);
        queue.sort();
      }
    }
  }
  return order; // a cycle (invalid content) would drop the cyclic nodes; acceptable.
}

// §4.3 / §10 drive — the next spine cell: first cell of the lowest-ordinal spine node
// whose status is `available` (available already excludes done).
export function nextSpineCell(
  model: LearnerModel,
  graph: Graph,
  cfg: EngineConfig = DEFAULT_CONFIG,
): string | null {
  const status = resolveAvailability(model, graph, cfg);
  for (const nodeId of spineOrder(graph)) {
    if (status[nodeId] === "available") {
      const cells = graph.nodes[nodeId]!.cells;
      if (cells.length > 0) return cells[0]!;
    }
  }
  return null;
}

export interface AvailabilityDiff {
  newlyAvailable: string[]; // locked → available (powers "you just unlocked X")
  newlyDone: string[]; // (locked|available) → done
}

// §4.3 — the diff of two availability passes (before vs. after applying a Diagnosis).
export function availabilityDiff(
  before: AvailabilityMap,
  after: AvailabilityMap,
): AvailabilityDiff {
  const newlyAvailable: string[] = [];
  const newlyDone: string[] = [];
  for (const id of Object.keys(after)) {
    if (before[id] === "locked" && after[id] === "available") newlyAvailable.push(id);
    if (before[id] !== "done" && after[id] === "done") newlyDone.push(id);
  }
  return { newlyAvailable: newlyAvailable.sort(), newlyDone: newlyDone.sort() };
}
