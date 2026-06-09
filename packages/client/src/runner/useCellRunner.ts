import { useCallback, useEffect, useMemo, useReducer } from "react";
import type { Bundle, Cell, Step, Diagnosis, Hint } from "@trellis/schema";
import {
  initialState,
  step as stepMachine,
  initialHintState,
  ladderFor,
  syncLadder,
  pullHint as enginePullHint,
  type MachineState,
  type HintState,
  type BuildSandbox,
} from "@trellis/engine";
import type { EventBus } from "../eventBus.js";
import type { TrellisDb } from "@trellis/persist";
import type { PeekBackEntry, StepAnswer } from "../types.js";
import { gradeStep, persistDiagnosis, type RunnerEffects } from "./grade.js";

export interface UseCellRunnerArgs {
  cell: Cell;
  bundle: Bundle;
  sandbox: BuildSandbox;
  bus: EventBus;
  db?: TrellisDb;
  effects: RunnerEffects;
}

interface RunnerState {
  activeStepIndex: number;
  machine: MachineState;
  hintState: HintState;
  buildCode: string;
  lastDiagnosis: Diagnosis | null;
  history: PeekBackEntry[];
  complete: boolean;
}

type Action =
  | { type: "enter" }
  | { type: "setBuildCode"; code: string }
  | { type: "evaluating" }
  | { type: "diagnosed"; diagnosis: Diagnosis }
  | { type: "retry" }
  | { type: "advance"; entry: PeekBackEntry | null; nextStarter: string }
  | { type: "pullHint"; next: HintState };

function reducer(state: RunnerState, action: Action, cell: Cell): RunnerState {
  const active = cell.steps[state.activeStepIndex]!;
  switch (action.type) {
    case "enter":
      return { ...state, machine: stepMachine(active.kind, state.machine, { type: "enter" }) };
    case "setBuildCode":
      return { ...state, buildCode: action.code };
    case "evaluating":
      return { ...state, machine: stepMachine(active.kind, state.machine, { type: "submit" }) };
    case "diagnosed": {
      const machine = stepMachine(active.kind, state.machine, { type: "diagnosis", correct: action.diagnosis.correct });
      const hintState = syncLadder(state.hintState, action.diagnosis);
      return { ...state, machine, hintState, lastDiagnosis: action.diagnosis };
    }
    case "retry":
      return { ...state, machine: stepMachine(active.kind, state.machine, { type: "retry" }) };
    case "advance": {
      const isLast = state.activeStepIndex >= cell.steps.length - 1;
      const history = action.entry ? [...state.history, action.entry] : state.history;
      if (isLast) {
        return { ...state, history, complete: true,
          machine: stepMachine(active.kind, state.machine, { type: "advance" }) };
      }
      const nextIndex = state.activeStepIndex + 1;
      const next = cell.steps[nextIndex]!;
      return {
        activeStepIndex: nextIndex,
        machine: stepMachine(next.kind, initialState(), { type: "enter" }),
        hintState: initialHintState(),
        buildCode: action.nextStarter,
        lastDiagnosis: null,
        history,
        complete: false,
      };
    }
    case "pullHint":
      return { ...state, hintState: action.next };
  }
}

function starterFor(step: Step): string {
  return step.kind === "build" ? step.starterCode : "";
}

function makePeekEntry(step: Step, diagnosis: Diagnosis | null): PeekBackEntry {
  const entry: PeekBackEntry = { stepId: step.id, kind: step.kind, promptSnapshot: step.prompt };
  if (step.carryContext !== undefined) entry.carryContext = step.carryContext;
  if (diagnosis) entry.outcome = { correct: diagnosis.correct, attribution: diagnosis.attribution };
  return entry;
}

export interface CellRunnerView {
  step: Step;
  phase: MachineState["phase"];
  hintState: HintState;
  ladder: Hint[];
  lastDiagnosis: Diagnosis | null;
  peekBack: PeekBackEntry[];
  buildCode: string;
  isComplete: boolean;
  submitNonBuild: (answer: Exclude<StepAnswer, { kind: "build" }>) => Promise<void>;
  submitBuild: () => Promise<void>;
  setBuildCode: (code: string) => void;
  advance: () => void;
  retry: () => void;
  pullHint: (opts?: { confirmRevealCode: true }) => void;
  openPeekBack: () => void;
}

export function useCellRunner(args: UseCellRunnerArgs): CellRunnerView {
  const { cell, bundle, sandbox, bus, db, effects } = args;
  const init: RunnerState = useMemo(
    () => ({
      activeStepIndex: 0,
      machine: initialState(),
      hintState: initialHintState(),
      buildCode: starterFor(cell.steps[0]!),
      lastDiagnosis: null,
      history: [],
      complete: false,
    }),
    [cell],
  );
  const [state, rawDispatch] = useReducer((s: RunnerState, a: Action) => reducer(s, a, cell), init);

  const active = cell.steps[state.activeStepIndex]!;

  // Auto-enter the first step (PENDING → ACTIVE) on mount; emit session_start + step_enter.
  useEffect(() => {
    bus.emit({ t: "session_start" });
    rawDispatch({ type: "enter" });
    bus.emit({ t: "step_enter", stepId: active.id, kind: active.kind });
    // mount-only (intentionally empty deps; the active step at mount is index 0)
  }, []);

  const ladder = useMemo<Hint[]>(() => ladderFor(state.hintState.ladderKey, bundle), [state.hintState.ladderKey, bundle]);

  const grade = useCallback(
    async (answer: StepAnswer): Promise<void> => {
      rawDispatch({ type: "evaluating" });
      const submission = answer.kind === "build" ? ({ kind: "build", code: state.buildCode } as const) : answer;
      const diagnosis = await gradeStep(active, submission, sandbox, bundle, effects);
      rawDispatch({ type: "diagnosed", diagnosis });
      bus.emit({ t: "submission", stepId: active.id, diagnosis });
      if (active.kind === "predict") {
        bus.emit({ t: "predict_answer", stepId: active.id, correct: diagnosis.correct });
      }
      if (db) await persistDiagnosis(db, bundle, diagnosis, []);
    },
    [active, sandbox, bundle, effects, bus, db, state.buildCode],
  );

  const submitNonBuild = useCallback(
    (answer: Exclude<StepAnswer, { kind: "build" }>) => grade(answer),
    [grade],
  );
  const submitBuild = useCallback(() => grade({ kind: "build", code: state.buildCode }), [grade, state.buildCode]);
  const setBuildCode = useCallback((code: string) => rawDispatch({ type: "setBuildCode", code }), []);
  const retry = useCallback(() => rawDispatch({ type: "retry" }), []);

  const advance = useCallback(() => {
    const entry = makePeekEntry(active, state.lastDiagnosis);
    const isLast = state.activeStepIndex >= cell.steps.length - 1;
    const nextStarter = isLast ? state.buildCode : starterFor(cell.steps[state.activeStepIndex + 1]!);
    rawDispatch({ type: "advance", entry, nextStarter });
    bus.emit({ t: "step_release", stepId: active.id });
    if (!isLast) {
      const next = cell.steps[state.activeStepIndex + 1]!;
      bus.emit({ t: "step_enter", stepId: next.id, kind: next.kind });
    }
  }, [active, state.lastDiagnosis, state.activeStepIndex, state.buildCode, cell, bus]);

  const pullHint = useCallback(
    (opts?: { confirmRevealCode: true }) => {
      const next = enginePullHint(state.hintState, ladder, opts);
      if (next.revealedThrough !== state.hintState.revealedThrough) {
        rawDispatch({ type: "pullHint", next });
        bus.emit({ t: "hint_request", stepId: active.id, level: next.revealedThrough as 1 | 2 | 3 | 4 });
      }
    },
    [state.hintState, ladder, bus, active.id],
  );

  const openPeekBack = useCallback(() => bus.emit({ t: "peek_back", stepId: active.id }), [bus, active.id]);

  return {
    step: active,
    phase: state.machine.phase,
    hintState: state.hintState,
    ladder,
    lastDiagnosis: state.lastDiagnosis,
    peekBack: state.history,
    buildCode: state.buildCode,
    isComplete: state.complete,
    submitNonBuild,
    submitBuild,
    setBuildCode,
    advance,
    retry,
    pullHint,
    openPeekBack,
  };
}
