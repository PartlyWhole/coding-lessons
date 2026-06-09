import type { StepKind, Diagnosis } from "@trellis/schema";

// StepId is exported from @trellis/schema only as a TypeBox value (TString), not as a
// companion `type StepId`. Using `string` directly here matches the underlying Static<TString>
// and is the same pattern used elsewhere in this monorepo for id fields.
type StepId = string;

// §11.1 — the semantic facts the presentation announces. Distinct from the persisted
// BehavioralEvent (§3.9): M6's @trellis/telemetry Recorder will map UiEvent → BehavioralEvent.
// The client defines this contract (M6 subscribes to it); the schema does not export it.
export type UiEvent =
  | { t: "session_start" }
  | { t: "step_enter"; stepId: StepId; kind: StepKind }
  | { t: "step_release"; stepId: StepId }
  | { t: "submission"; stepId: StepId; diagnosis: Diagnosis }
  | { t: "editor_change"; stepId: StepId; length: number; hash: string }
  | { t: "run"; stepId: StepId }
  | { t: "predict_answer"; stepId: StepId; correct: boolean }
  | { t: "hint_request"; stepId: StepId; level: 1 | 2 | 3 | 4 }
  | { t: "peek_back"; stepId: StepId }
  | { t: "focus"; stepId: StepId; focused: boolean };

export interface EventBus {
  emit(e: UiEvent): void; // sync fan-out; subscriber errors caught + swallowed
  subscribe(fn: (e: UiEvent) => void): () => void; // returns an unsubscribe handle
}

// The STUBBED seam (§11.1): a real pub/sub bus with emit sites wired throughout the client,
// but NO subscriber attached by the client. M6 telemetry attaches a Recorder via subscribe()
// with ZERO emit-site change. An emit never throws into the caller — a telemetry bug cannot
// break the lesson.
export function createEventBus(): EventBus {
  const subs = new Set<(e: UiEvent) => void>();
  return {
    emit(e) {
      for (const fn of subs) {
        try {
          fn(e);
        } catch {
          // swallow: telemetry failures must never propagate into the UI.
        }
      }
    },
    subscribe(fn) {
      subs.add(fn);
      return () => {
        subs.delete(fn);
      };
    },
  };
}
