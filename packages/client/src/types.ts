import type { StepKind, Attribution } from "@trellis/schema";

// §17.3 — the injected main-thread pygame player. A type alias of the runtime's own
// interface so the real createPygameRuntime() is assignable verbatim; client tests
// fake this shape. OPTIONAL everywhere it is threaded: absent → non-pygame rendering
// is exactly today's (frozen) behavior.
export type { PygameRuntime as ClientPygameRuntime } from "@trellis/runtime";

// §5.3 — a peek-back entry is a SNAPSHOT reconstructed from released-step history,
// never live step state. Immune to step unmounting.
export interface PeekBackEntry {
  stepId: string;
  kind: StepKind;
  promptSnapshot: string; // RichText is a markdown string in v1
  carryContext?: string;
  outcome?: { correct: boolean; attribution: Attribution };
}

// A learner's answer leaving a step view, headed for the runner. Mirrors the engine's
// NonBuildSubmission shapes plus the build code, but is the UI-side carrier.
export type StepAnswer =
  | { kind: "recognize"; choiceId: string }
  | { kind: "recall"; text: string }
  | { kind: "predict"; choiceId?: string; text?: string }
  | { kind: "build"; code: string };
