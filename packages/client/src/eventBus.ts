// The UiEvent/EventBus contract now lives in @trellis/telemetry (§11.1 — D1 type seam,
// M6). This module is a pure re-export shim so every existing import site (and emit site)
// keeps compiling UNCHANGED. A type-import change is not an emit-site change.
export type { UiEvent, EventBus } from "@trellis/telemetry";
export { createEventBus } from "@trellis/telemetry";
