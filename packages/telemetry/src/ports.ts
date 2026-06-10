// §11.1 / D2 — telemetry's injected ports. The package's only runtime dependency is
// @trellis/schema; everything effectful (persist, clock, uuid, DOM listeners) arrives
// through these narrow interfaces so tests drive them deterministically (§11 guardrail:
// injected clock, never wall-time assertions).
import type { BehavioralEvent } from "@trellis/schema";

/** Opaque timer handle (whatever the host clock returns). */
export type Timer = unknown;

// Wall-clock + timers. Argument order `setTimer(fn, ms)` follows the repo precedent
// (packages/sandbox/src/clock.ts), NOT §11.1's pseudo-interface `setTimer(ms, fn)`.
// Unlike sandbox's realClock (performance.now), telemetry MUST use Date.now: the
// BehavioralEvent.ts field is ISO-8601 wall time (§3.9).
export interface Clock {
  now(): number; // epoch ms
  setTimer(fn: () => void, ms: number): Timer;
  clearTimer(t: Timer): void;
}

export const realClock: Clock = {
  now: () => Date.now(),
  setTimer: (fn, ms) => setTimeout(fn, ms),
  clearTimer: (t) => clearTimeout(t as ReturnType<typeof setTimeout>),
};

/** Id source for BehavioralEvent.id and sessionId. */
export interface Ids {
  uuid(): string;
}

export const realIds: Ids = {
  uuid: () => crypto.randomUUID(),
};

// The ONLY DOM touch telemetry is allowed (visibility/pagehide flush triggers), via an
// injected target — telemetry never references document/window itself. The client binds
// this to a tiny adapter routing visibilitychange→document and pagehide→window.
export interface ListenerTarget {
  addEventListener(type: string, fn: () => void): void;
  removeEventListener(type: string, fn: () => void): void;
}

// Telemetry-owned persist port (§11.1 outbound seam). The CLIENT binds it to a TrellisDb
// (it already imports @trellis/persist); telemetry itself never imports persist at runtime.
export interface TelemetryPersist {
  appendEvents(events: BehavioralEvent[]): Promise<void>;
  recentEvents(q: { stepId?: string; limit?: number }): Promise<BehavioralEvent[]>;
}
