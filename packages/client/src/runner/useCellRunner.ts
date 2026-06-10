import { useCallback, useEffect, useMemo, useReducer, useRef } from "react";
import type { Bundle, Cell, Step, StepKind, Diagnosis, Hint } from "@trellis/schema";
import {
  initialState,
  step as stepMachine,
  initialHintState,
  ladderFor,
  syncLadder,
  pullHint as enginePullHint,
  StepTransitionError,
  type MachineState,
  type StepEvent,
  type HintState,
  type BuildSandbox,
} from "@trellis/engine";
import { hashText, DEFAULT_CAPTURE_POLICY } from "@trellis/telemetry";
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
  /** M6 E1 — telemetry-only: announce a Run press ({t:"run"}). No behavior. */
  emitRun: () => void;
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

  // M6 emit sites (E1/E2/E3 — telemetry-only; zero behavior): stable callbacks read the
  // CURRENT active step id through this ref, mirroring the machineRef pattern below.
  const activeIdRef = useRef(active.id);
  activeIdRef.current = active.id;

  // ⚑ Hotfix (live-site crash): mirror of the committed machine state, resynced every render.
  // User-triggerable dispatchers must consult/claim THIS (not a closure) so a second event in
  // the same tick — or after the phase moved (double-click, Enter-spam) — sees the current
  // phase. The engine's stepMachine stays the single source of legality: we PROBE it.
  const machineRef = useRef(state.machine);
  machineRef.current = state.machine;

  // Probe the engine's own transition rules against the CURRENT machine state and, if legal,
  // claim the transition synchronously (so a same-tick double-fire of the same event no-ops).
  // Returns false when the machine would reject the event — caller must not dispatch.
  // This never swallows machine errors: the reducer still runs the real transition; we only
  // prevent illegal events from ever being dispatched (engine fail-fast stays intact).
  const claimTransition = useCallback((kind: StepKind, event: StepEvent): boolean => {
    try {
      machineRef.current = stepMachine(kind, machineRef.current, event);
      return true;
    } catch (e) {
      if (e instanceof StepTransitionError) return false;
      throw e;
    }
  }, []);

  // Auto-enter the first step (PENDING → ACTIVE) on mount; emit session_start + step_enter.
  // Guarded: a double-run of this effect (e.g. StrictMode remount) must not re-enter ACTIVE.
  useEffect(() => {
    if (!claimTransition(active.kind, { type: "enter" })) return;
    bus.emit({ t: "session_start" });
    rawDispatch({ type: "enter" });
    bus.emit({ t: "step_enter", stepId: active.id, kind: active.kind });
    // mount-only (intentionally empty deps; the active step at mount is index 0)
  }, []);

  const ladder = useMemo<Hint[]>(() => ladderFor(state.hintState.ladderKey, bundle), [state.hintState.ladderKey, bundle]);

  const grade = useCallback(
    async (answer: StepAnswer): Promise<void> => {
      // Boundary guard (the live-site crash): only proceed if the machine accepts "submit"
      // RIGHT NOW. A second submit in FEEDBACK (double-click; Enter in the still-mounted
      // input) or in EVALUATING (same-tick race) is a learner-level no-op, never a dispatch.
      if (!claimTransition(active.kind, { type: "submit" })) return;
      rawDispatch({ type: "evaluating" });
      const submission = answer.kind === "build" ? ({ kind: "build", code: state.buildCode } as const) : answer;
      const diagnosis = await gradeStep(active, submission, sandbox, bundle, effects);
      // Re-check after the await: if the machine moved out of EVALUATING underneath us
      // (e.g. a reset), drop this stale result instead of dispatching an illegal event.
      if (!claimTransition(active.kind, { type: "diagnosis", correct: diagnosis.correct })) return;
      rawDispatch({ type: "diagnosed", diagnosis });
      bus.emit({ t: "submission", stepId: active.id, diagnosis });
      if (active.kind === "predict") {
        bus.emit({ t: "predict_answer", stepId: active.id, correct: diagnosis.correct });
      }
      if (db) {
        try {
          await persistDiagnosis(db, bundle, diagnosis, []);
        } catch (e) {
          // Teardown race: unmount closes IndexedDB while this grade is still in flight →
          // `transaction` throws InvalidStateError. Callers fire-and-forget (`void grade()`),
          // so rethrowing would be an UNHANDLED rejection. Losing one diagnosis write on
          // teardown is acceptable; surface it honestly and move on.
          console.warn("trellis: diagnosis not persisted (db closing or unavailable)", e);
        }
      }
    },
    [active, sandbox, bundle, effects, bus, db, state.buildCode, claimTransition],
  );

  const submitNonBuild = useCallback(
    (answer: Exclude<StepAnswer, { kind: "build" }>) => grade(answer),
    [grade],
  );
  const submitBuild = useCallback(() => grade({ kind: "build", code: state.buildCode }), [grade, state.buildCode]);
  // M6 E2 — debounced {t:"editor_change"} beside the (unchanged) immediate state update.
  // CapturePolicy.editorDebounceMs collapses a typing burst into one emit; the payload is
  // length+hash ONLY (§11.2 — raw text never crosses the bus). The stepId is captured at
  // keystroke time so a pending emit that fires after an advance still names the step the
  // edit happened on.
  const editorTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const setBuildCode = useCallback(
    (code: string) => {
      rawDispatch({ type: "setBuildCode", code });
      const stepId = activeIdRef.current;
      if (editorTimer.current !== null) clearTimeout(editorTimer.current);
      editorTimer.current = setTimeout(() => {
        editorTimer.current = null;
        bus.emit({ t: "editor_change", stepId, length: code.length, hash: hashText(code) });
      }, DEFAULT_CAPTURE_POLICY.editorDebounceMs);
    },
    [bus],
  );
  // A pending debounce must never emit after unmount.
  useEffect(
    () => () => {
      if (editorTimer.current !== null) clearTimeout(editorTimer.current);
    },
    [],
  );

  // M6 E3 — window attention: {t:"focus", focused} for the active step. Mount-once
  // listeners (the ref keeps the stepId current); emit-only, removed on unmount.
  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const onFocus = (): void => bus.emit({ t: "focus", stepId: activeIdRef.current, focused: true });
    const onBlur = (): void => bus.emit({ t: "focus", stepId: activeIdRef.current, focused: false });
    window.addEventListener("focus", onFocus);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("blur", onBlur);
    };
  }, [bus]);

  // M6 E1 — a Run press (PygameStage) is announced, never acted on, here.
  const emitRun = useCallback(() => bus.emit({ t: "run", stepId: activeIdRef.current }), [bus]);
  // Guarded: "retry" is only legal in FEEDBACK — a double-fire (second lands in ACTIVE)
  // must be a no-op, not a reducer throw.
  const retry = useCallback(() => {
    if (!claimTransition(active.kind, { type: "retry" })) return;
    rawDispatch({ type: "retry" });
  }, [claimTransition, active.kind]);

  // Guarded: a double-fired advance (second lands on the NEXT step's machine) must be a
  // no-op — for a non-watch next step it would throw; for a watch step it would silently
  // skip it. The claim leaves machineRef at RELEASED until the reducer's next-step "enter"
  // commits, so the same-tick second call is rejected by the machine's own rules.
  const advance = useCallback(() => {
    if (!claimTransition(active.kind, { type: "advance" })) return;
    const entry = makePeekEntry(active, state.lastDiagnosis);
    const isLast = state.activeStepIndex >= cell.steps.length - 1;
    const nextStarter = isLast ? state.buildCode : starterFor(cell.steps[state.activeStepIndex + 1]!);
    rawDispatch({ type: "advance", entry, nextStarter });
    bus.emit({ t: "step_release", stepId: active.id });
    if (!isLast) {
      const next = cell.steps[state.activeStepIndex + 1]!;
      bus.emit({ t: "step_enter", stepId: next.id, kind: next.kind });
    }
  }, [active, state.lastDiagnosis, state.activeStepIndex, state.buildCode, cell, bus, claimTransition]);

  // Audited (no guard needed): pullHint never dispatches a machine event — it only updates
  // hintState via the engine's phase-independent ladder logic, so it cannot throw for a
  // phase reason. Same for setBuildCode (pure editor state).
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
    emitRun,
  };
}
