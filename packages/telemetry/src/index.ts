// @trellis/telemetry — §11 behavior logging & proactive scaffolding (M6).
export type { UiEvent, EventBus } from "./bus.js";
export { createEventBus } from "./bus.js";
export type { Timer, Clock, Ids, ListenerTarget, TelemetryPersist } from "./ports.js";
export { realClock, realIds } from "./ports.js";
export type { CapturePolicy } from "./policy.js";
export { DEFAULT_CAPTURE_POLICY, hashText } from "./policy.js";
export type { EditorSnapshot } from "./derive.js";
export { editDistanceProxy, trailingFailStreak, wrongPredictThenCorrect } from "./derive.js";
export type { Recorder, RecorderDeps } from "./recorder.js";
export { createRecorder } from "./recorder.js";
export type { IdleSignal, IdleDetector, IdleDetectorDeps } from "./idle.js";
export { createIdleDetector } from "./idle.js";
export type { EventBuffer, EventBufferDeps } from "./buffer.js";
export { createEventBuffer } from "./buffer.js";
export type { AttachTelemetryDeps } from "./attach.js";
export { attachTelemetry } from "./attach.js";
