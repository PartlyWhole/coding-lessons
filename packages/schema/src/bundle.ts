import { Type, type Static } from "@sinclair/typebox";
import {
  SkillId,
  NodeId,
  CellId,
  MisconId,
  ContentVersion,
  Json,
} from "./ids.js";
import { Skill, ConceptNode, Cell, Misconception, Requirement } from "./content.js";

// ============================================================================
// FROZEN CROSS-STREAM CONTRACT (do not change in a milestone branch).
//
// This is the integration seam between the parallel work streams:
//   - M1 (@trellis/authoring) COMPILES source YAML → a `Bundle` and emits it.
//   - M2 (@trellis/engine) CONSUMES a `Bundle`/`Graph` (resolver, navigation).
//   - M3a (@trellis/sandbox) IMPLEMENTS `Sandbox` and returns `RunResult`.
// If a stream believes the seam must change, STOP and escalate to the
// orchestrator (a change lands here on `main` first, then streams rebase) —
// never fork the contract inside a milestone branch.
// ============================================================================

// ---------------------------------------------------------------------------
// The compiled, immutable content bundle (§3.10, §4.1). Entities are keyed by
// id (point-get access matches the engine's usage, e.g. bundle.skills[id]).
// The on-disk content-addressed manifest / id→offset lazy-load layout is M1's
// concern; this is the logical shape the engine consumes after load.
// ---------------------------------------------------------------------------

// §4.1 derived indexes, materialized at compile time for O(1) runtime resolution.
export const Producers = Type.Record(SkillId, Type.Array(NodeId)); // skill → nodes that teach it
export type Producers = Static<typeof Producers>;

export const Requirements = Type.Record(NodeId, Type.Array(Requirement)); // node → flattened, deduped requires
export type Requirements = Static<typeof Requirements>;

// The subset the availability resolver (§4.3) needs. A Bundle satisfies Graph structurally.
export const Graph = Type.Object({
  nodes: Type.Record(NodeId, ConceptNode),
  producers: Producers,
  requirements: Requirements,
});
export type Graph = Static<typeof Graph>;

export const Bundle = Type.Object({
  contentVersion: ContentVersion,
  skills: Type.Record(SkillId, Skill),
  nodes: Type.Record(NodeId, ConceptNode),
  cells: Type.Record(CellId, Cell),
  misconceptions: Type.Record(MisconId, Misconception),
  // derived indexes (§4.1) — present so the engine never recomputes them at runtime.
  producers: Producers,
  requirements: Requirements,
});
export type Bundle = Static<typeof Bundle>;

// ---------------------------------------------------------------------------
// Sandbox execution contract (§6.1). RunResult is data that crosses the worker
// boundary (so it has a runtime schema); Sandbox is the behavioral interface
// the worker host implements and the build ladder calls. Injected into the
// engine — the pure engine never imports a concrete sandbox.
// ---------------------------------------------------------------------------

export const RunResult = Type.Object({
  ran: Type.Boolean(),
  error: Type.Optional(
    Type.Object({
      type: Type.Union([Type.Literal("syntax"), Type.Literal("runtime")]),
      message: Type.String(),
      line: Type.Optional(Type.Number()),
    }),
  ),
  stdout: Type.String(),
  returnValue: Type.Optional(Json),
  wallMs: Type.Number({ minimum: 0 }),
  timedOut: Type.Boolean(),
});
export type RunResult = Static<typeof RunResult>;

export interface RunRequest {
  code: string;
  entrypoint?: string;
  stdin?: string;
  timeoutMs: number; // host-armed watchdog → worker.terminate() on expiry
  memoryMb: number; // WebAssembly.Memory maximum
}

export interface Sandbox {
  // Stateless per call; fresh Python namespace each run to avoid cross-step bleed (§6.1).
  run(req: RunRequest): Promise<RunResult>;
}
