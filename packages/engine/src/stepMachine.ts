import type { StepKind } from "@trellis/schema";

// §5.1 — the step lifecycle as pure transitions. Exactly one step is ACTIVE per cell.
export type Phase = "PENDING" | "ACTIVE" | "EVALUATING" | "FEEDBACK" | "RELEASED";

export interface MachineState {
  phase: Phase;
  // null until a Diagnosis arrives; gates `advance` out of FEEDBACK.
  lastCorrect: boolean | null;
}

export type StepEvent =
  | { type: "enter" }
  | { type: "submit" }
  | { type: "diagnosis"; correct: boolean }
  | { type: "hint" }
  | { type: "retry" }
  | { type: "advance"; allowSkip?: boolean };

export class StepTransitionError extends Error {
  constructor(kind: StepKind, phase: Phase, event: StepEvent["type"]) {
    super(`invalid transition: ${kind} step in ${phase} cannot handle "${event}"`);
    this.name = "StepTransitionError";
  }
}

export function initialState(): MachineState {
  return { phase: "PENDING", lastCorrect: null };
}

// `watch` steps have no evaluation: ACTIVE --advance--> RELEASED and cannot submit.
export function step(kind: StepKind, state: MachineState, event: StepEvent): MachineState {
  const { phase } = state;
  const fail = (): never => {
    throw new StepTransitionError(kind, phase, event.type);
  };

  switch (phase) {
    case "PENDING":
      if (event.type === "enter") return { phase: "ACTIVE", lastCorrect: null };
      return fail();

    case "ACTIVE":
      if (kind === "watch") {
        // watch steps are passive: only advance (no submit, no hint ladder — §5.1).
        if (event.type === "advance") return { phase: "RELEASED", lastCorrect: null };
        return fail();
      }
      if (event.type === "hint") return state; // phase-preserving (ladder is M4)
      if (event.type === "submit") return { phase: "EVALUATING", lastCorrect: null };
      return fail();

    case "EVALUATING":
      if (event.type === "diagnosis") return { phase: "FEEDBACK", lastCorrect: event.correct };
      return fail();

    case "FEEDBACK":
      if (event.type === "hint") return state; // phase-preserving
      if (event.type === "retry") return { phase: "ACTIVE", lastCorrect: null };
      if (event.type === "advance") {
        if (state.lastCorrect === true || event.allowSkip === true) {
          return { phase: "RELEASED", lastCorrect: state.lastCorrect };
        }
        return fail(); // advance requires correct or an authored allowSkip
      }
      return fail();

    case "RELEASED":
      return fail(); // terminal
  }
}
