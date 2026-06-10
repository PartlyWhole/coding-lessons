// §11.1 TelemetryRecorder.attach — the one-line seam the client calls. Wires
// bus → Recorder → EventBuffer → persist.appendEvents, with the IdleDetector reset by
// every bus event. Returns detach. The §11.4 master switch lives HERE: policy.enabled
// false means NOTHING subscribes — the recorder simply does not exist on the bus.
import type { UiEvent, EventBus } from "./bus.js";
import type { Clock, Ids, ListenerTarget, TelemetryPersist } from "./ports.js";
import type { CapturePolicy } from "./policy.js";
import { createRecorder } from "./recorder.js";
import { createIdleDetector } from "./idle.js";
import { createEventBuffer } from "./buffer.js";

export interface AttachTelemetryDeps {
  bus: EventBus;
  persist: TelemetryPersist;
  clock: Clock;
  ids: Ids;
  policy: CapturePolicy;
  learnerId: string;
  target: ListenerTarget;
  isHidden: () => boolean;
}

function stepIdOf(e: UiEvent): string {
  return e.t === "session_start" ? "" : e.stepId;
}

export function attachTelemetry(deps: AttachTelemetryDeps): () => void {
  const { bus, persist, clock, ids, policy, learnerId, target, isHidden } = deps;
  if (!policy.enabled) {
    return () => undefined; // master switch: never subscribe, no listeners, no rows, ever
  }

  const sessionId = ids.uuid(); // per-page-load session (§11.2)

  const buffer = createEventBuffer({
    clock,
    target,
    isHidden,
    sink: (rows) => persist.appendEvents(rows),
  });

  const recorder = createRecorder({
    learnerId,
    sessionId,
    clock,
    ids,
    policy,
    emitRow: (row) => {
      buffer.push(row);
      // Submissions flush immediately (they are rare — no-write-per-keystroke holds):
      // the ProactiveScaffolder evaluates its rules on submission via persist.recentEvents,
      // so the row must be durably readable right behind the bus event (D5 read-after-write).
      if (row.type === "submission") void buffer.flush();
    },
  });

  const idle = createIdleDetector({
    clock,
    thresholdMs: policy.idleThresholdMs,
    onSignal: (s) => recorder.emitInternal(s.kind, s.stepId, { durationMs: s.durationMs }),
  });

  const unsubscribe = bus.subscribe((e) => {
    recorder.onUiEvent(e);
    idle.reset(stepIdOf(e)); // every UiEvent is learner activity
  });

  return function detach(): void {
    unsubscribe();
    idle.dispose();
    void buffer.flush(); // drain pending rows; flush never rejects (closing-db safe)
    buffer.dispose();
  };
}
