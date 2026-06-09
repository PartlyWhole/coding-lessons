import type { StepKind, Attribution } from "@trellis/schema";

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
