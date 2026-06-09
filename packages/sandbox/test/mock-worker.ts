import type { Clock, Timer } from "../src/clock.js";
import type {
  HostToWorker,
  WorkerLike,
  WorkerToHost,
  WireRunRequest,
  RunResultData,
} from "../src/protocol.js";

// A deterministic clock: tests call advance(ms) to fire due timers and move now().
export class FakeClock implements Clock {
  private t = 0;
  private timers: { at: number; fn: () => void; id: Timer }[] = [];

  now(): number {
    return this.t;
  }

  setTimer(fn: () => void, ms: number): Timer {
    const id: Timer = {};
    this.timers.push({ at: this.t + ms, fn, id });
    return id;
  }

  clearTimer(id: Timer): void {
    this.timers = this.timers.filter((x) => x.id !== id);
  }

  // Advance time; fire all timers whose deadline has passed, in chronological order.
  advance(ms: number): void {
    this.t += ms;
    const due = this.timers.filter((x) => x.at <= this.t).sort((a, b) => a.at - b.at);
    this.timers = this.timers.filter((x) => x.at > this.t);
    for (const d of due) d.fn();
  }
}

// Flush the microtask queue so message handlers (dispatched via queueMicrotask) run.
export const flush = (): Promise<void> => new Promise<void>((r) => queueMicrotask(r));

export type RunOutcome = RunResultData | "hang";

export interface MockBehavior {
  // "immediate" (default): post ready in a microtask. "never": never become ready.
  ready?: "immediate" | "never";
  // Per-run outcome. Default: a trivial success. "hang" never replies (infinite loop).
  onRun?: (req: WireRunRequest) => RunOutcome;
}

export interface MockWorker extends WorkerLike {
  readonly terminated: boolean;
  readonly initMemoryMb: number | null;
  readonly runCount: number;
}

// Factory that records every worker it makes, so tests can inspect the pool.
export function makeMockFactory(behavior: MockBehavior = {}): {
  factory: () => MockWorker;
  workers: MockWorker[];
} {
  const workers: MockWorker[] = [];
  const factory = (): MockWorker => {
    let terminated = false;
    let initMemoryMb: number | null = null;
    let runCount = 0;
    const self: MockWorker = {
      onmessage: null,
      onerror: null,
      get terminated() {
        return terminated;
      },
      get initMemoryMb() {
        return initMemoryMb;
      },
      get runCount() {
        return runCount;
      },
      postMessage(msg: HostToWorker) {
        if (terminated) return;
        if (msg.kind === "init") {
          initMemoryMb = msg.memoryMb;
          if ((behavior.ready ?? "immediate") === "immediate") {
            queueMicrotask(() => {
              if (!terminated) self.onmessage?.({ data: { kind: "ready" } as WorkerToHost });
            });
          }
          return;
        }
        // kind === "run"
        runCount += 1;
        const outcome = (behavior.onRun ?? defaultRun)(msg.req);
        if (outcome === "hang") return; // never replies → watchdog must fire
        queueMicrotask(() => {
          if (!terminated) {
            self.onmessage?.({ data: { kind: "result", id: msg.id, result: outcome } });
          }
        });
      },
      terminate() {
        terminated = true;
      },
    };
    workers.push(self);
    return self;
  };
  return { factory, workers };
}

const defaultRun = (req: WireRunRequest): RunResultData => ({
  ran: true,
  stdout: "",
  returnValue: null,
  wallMs: 1,
  timedOut: false,
});
