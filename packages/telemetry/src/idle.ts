// §11.1 IdleDetector — fires `idle` exactly once when no activity arrives for thresholdMs,
// then `dwell` (with the FULL away-gap) when activity resumes. Time is the INJECTED Clock
// only: tests drive it deterministically; production binds realClock.
import type { Clock, Timer } from "./ports.js";

export interface IdleSignal {
  kind: "idle" | "dwell";
  stepId: string;
  durationMs: number;
}

export interface IdleDetectorDeps {
  clock: Clock;
  thresholdMs: number;
  onSignal: (s: IdleSignal) => void;
}

export interface IdleDetector {
  /** Any learner activity: re-arms the idle timer; closes an open idle with a dwell. */
  reset(stepId: string): void;
  dispose(): void;
}

export function createIdleDetector(deps: IdleDetectorDeps): IdleDetector {
  const { clock, thresholdMs, onSignal } = deps;
  let timer: Timer | null = null;
  let lastActivityAt = 0;
  let stepId = "";
  let idleOpen = false;
  let disposed = false;

  function clear(): void {
    if (timer !== null) {
      clock.clearTimer(timer);
      timer = null;
    }
  }

  return {
    reset(s: string): void {
      if (disposed) return;
      const now = clock.now();
      if (idleOpen) {
        // Return from idle: the dwell is the WHOLE gap since the last activity (§11.1),
        // not just the slice after the idle signal fired.
        onSignal({ kind: "dwell", stepId: s, durationMs: now - lastActivityAt });
        idleOpen = false;
      }
      stepId = s;
      lastActivityAt = now;
      clear();
      timer = clock.setTimer(() => {
        timer = null;
        idleOpen = true;
        onSignal({ kind: "idle", stepId, durationMs: thresholdMs });
        // no re-arm: idle fires once; the next reset() re-arms.
      }, thresholdMs);
    },
    dispose(): void {
      disposed = true;
      clear();
    },
  };
}
