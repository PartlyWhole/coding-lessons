// §11.2 Recorder — maps UiEvent → BehavioralEvent rows (§3.9), stamping sessionId,
// monotonic GAP-FREE seq (assigned at row-creation time, not flush time — ordering
// survives batching), wall-clock ISO ts, and the derived submission signals (D4).
// The Recorder is the ONLY producer of rows; persistence is someone else's job (buffer).
import type { BehavioralEvent, SignalType, Diagnosis } from "@trellis/schema";
import type { UiEvent } from "./bus.js";
import type { Clock, Ids } from "./ports.js";
import type { CapturePolicy } from "./policy.js";
import { editDistanceProxy, type EditorSnapshot } from "./derive.js";

export interface RecorderDeps {
  learnerId: string;
  sessionId: string;
  clock: Clock;
  ids: Ids;
  policy: CapturePolicy;
  emitRow: (row: BehavioralEvent) => void;
}

export interface Recorder {
  onUiEvent(e: UiEvent): void;
  /** Side door for detector-originated signals (idle/dwell) — same seq/ts pipeline. */
  emitInternal(type: SignalType, stepId: string, payload: BehavioralEvent["payload"]): void;
}

interface StepTrack {
  kind?: string;
  lastEdit?: EditorSnapshot; // latest editor_change fingerprint
  prevSubmissionEdit?: EditorSnapshot; // fingerprint at the previous submission (D4 proxy)
  failStreak: number;
  lastSubmissionAt?: number;
}

// session_start has no active step; BehavioralEvent.stepId is required. "" never collides
// with a real StepId and never matches a by_step_ts query (orchestrator-accepted sentinel).
const NO_STEP = "";

export function createRecorder(deps: RecorderDeps): Recorder {
  const { learnerId, sessionId, clock, ids, emitRow } = deps;
  let seq = 0;
  const steps = new Map<string, StepTrack>();

  function track(stepId: string): StepTrack {
    let t = steps.get(stepId);
    if (t === undefined) {
      t = { failStreak: 0 };
      steps.set(stepId, t);
    }
    return t;
  }

  function stamp(type: SignalType, stepId: string, payload: BehavioralEvent["payload"]): void {
    emitRow({
      id: ids.uuid(),
      learnerId,
      sessionId,
      seq: seq++,
      stepId,
      ts: new Date(clock.now()).toISOString(),
      type,
      payload,
    });
  }

  function submissionPayload(stepId: string, d: Diagnosis): BehavioralEvent["payload"] {
    const t = track(stepId);
    t.failStreak = d.correct ? 0 : t.failStreak + 1;
    // Deliberately NOT the whole Diagnosis: signals may contain stdout/raw text (§11.4).
    const p: Record<string, unknown> = {
      correct: d.correct,
      attribution: d.attribution,
      stepKind: t.kind,
      failStreak: t.failStreak,
    };
    if (d.misconceptionId !== undefined) p["misconceptionId"] = d.misconceptionId;
    if (t.lastEdit !== undefined) {
      p["editLength"] = t.lastEdit.length;
      p["editHash"] = t.lastEdit.hash;
      if (t.prevSubmissionEdit !== undefined) {
        p["editDistanceProxy"] = editDistanceProxy(t.prevSubmissionEdit, t.lastEdit);
      }
      t.prevSubmissionEdit = t.lastEdit;
    }
    const now = clock.now();
    if (t.lastSubmissionAt !== undefined) p["msSinceLastSubmission"] = now - t.lastSubmissionAt;
    t.lastSubmissionAt = now;
    return p as BehavioralEvent["payload"];
  }

  return {
    onUiEvent(e: UiEvent): void {
      switch (e.t) {
        case "session_start":
          return stamp("session_start", NO_STEP, {});
        case "step_enter": {
          const t = track(e.stepId);
          t.kind = e.kind;
          t.failStreak = 0; // re-entry starts fresh
          return stamp("step_enter", e.stepId, { kind: e.kind });
        }
        case "step_release":
          return stamp("step_release", e.stepId, {});
        case "submission":
          return stamp("submission", e.stepId, submissionPayload(e.stepId, e.diagnosis));
        case "predict_answer":
          return; // E4 fold: the concurrent submission row already carries stepKind+correct
        case "run":
          return stamp("run", e.stepId, {});
        case "editor_change": {
          track(e.stepId).lastEdit = { length: e.length, hash: e.hash };
          return stamp("editor_change", e.stepId, { length: e.length, hash: e.hash });
        }
        case "hint_request":
          return stamp("hint_requested", e.stepId, { level: e.level });
        case "peek_back":
          return stamp("peek_back", e.stepId, {});
        case "focus":
          return stamp("focus_change", e.stepId, { focused: e.focused });
      }
    },
    emitInternal(type, stepId, payload): void {
      stamp(type, stepId, payload);
    },
  };
}
