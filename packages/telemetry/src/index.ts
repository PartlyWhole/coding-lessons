// @trellis/telemetry — §11 behavior logging & proactive scaffolding (M6).
export type { UiEvent, EventBus } from "./bus.js";
export { createEventBus } from "./bus.js";
export type { Timer, Clock, Ids, ListenerTarget, TelemetryPersist } from "./ports.js";
export { realClock, realIds } from "./ports.js";
