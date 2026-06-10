// §11.1 EventBuffer (D7) — batches rows so persistence is never per-keystroke, and never
// lossy on close. Flush triggers: size ≥ maxBatch · interval timer (armed only while
// non-empty) · pagehide / hidden-visibilitychange via the injected ListenerTarget.
// Rows leave the buffer only after the sink resolves; a failed flush re-queues at the
// FRONT (seq is already stamped, so order survives). Flush errors never reject upward —
// a flush racing a closing IndexedDB must warn-and-drop, never unhandled-reject (M5
// teardown lesson).
import type { BehavioralEvent } from "@trellis/schema";
import type { Clock, ListenerTarget, Timer } from "./ports.js";

export interface EventBufferDeps {
  clock: Clock;
  target: ListenerTarget;
  isHidden: () => boolean;
  sink: (rows: BehavioralEvent[]) => Promise<void>;
  maxBatch?: number;
  flushIntervalMs?: number;
}

export interface EventBuffer {
  push(row: BehavioralEvent): void;
  /** Drain now. Resolves when this drain settles; NEVER rejects. */
  flush(): Promise<void>;
  dispose(): void;
}

export function createEventBuffer(deps: EventBufferDeps): EventBuffer {
  const { clock, target, isHidden, sink } = deps;
  const maxBatch = deps.maxBatch ?? 20;
  const flushIntervalMs = deps.flushIntervalMs ?? 5_000;

  let buf: BehavioralEvent[] = [];
  let timer: Timer | null = null;
  // Serialize drains: a second flush while one is in flight waits its turn, so a failed
  // batch re-queued at the front is always re-delivered before (and with) newer rows.
  let chain: Promise<void> = Promise.resolve();

  function clearTimer(): void {
    if (timer !== null) {
      clock.clearTimer(timer);
      timer = null;
    }
  }

  async function drain(): Promise<void> {
    if (buf.length === 0) return;
    const batch = buf;
    buf = [];
    clearTimer();
    try {
      await sink(batch);
    } catch (e) {
      buf = [...batch, ...buf]; // re-queue at the front: no loss, no reorder
      // eslint-disable-next-line no-console
      console.warn("trellis telemetry: flush failed (db closing or unavailable); rows retained", e);
    }
  }

  function flush(): Promise<void> {
    chain = chain.then(drain);
    return chain;
  }

  const onVisibility = (): void => {
    if (isHidden()) void flush();
  };
  const onPagehide = (): void => {
    void flush(); // necessarily best-effort: async IndexedDB during unload
  };
  target.addEventListener("visibilitychange", onVisibility);
  target.addEventListener("pagehide", onPagehide);

  return {
    push(row: BehavioralEvent): void {
      buf.push(row);
      if (buf.length >= maxBatch) {
        void flush();
        return;
      }
      if (timer === null) {
        timer = clock.setTimer(() => {
          timer = null;
          void flush();
        }, flushIntervalMs);
      }
    },
    flush,
    dispose(): void {
      target.removeEventListener("visibilitychange", onVisibility);
      target.removeEventListener("pagehide", onPagehide);
      clearTimer();
    },
  };
}
