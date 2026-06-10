import type { StallEvent } from "./types.js";

export interface WatchdogOpts {
  budgetMs?: number; // default 500 — generous; play loops sleep ~16ms
  consecutive?: number; // default 3
  raf?: (cb: FrameRequestCallback) => number;
  caf?: (id: number) => void;
}
export interface Watchdog {
  start(onStall: (e: StallEvent) => void): void;
  stop(): void;
}

// HONEST SCOPE (§17.5): rAF can only observe a SLUGGISH loop (long frames). A fully
// blocked main thread never runs this callback at all — preventing that is the AST
// pre-check's job (guard 1). Last-resort recovery for the learner is a page reload.
export function createWatchdog(opts: WatchdogOpts = {}): Watchdog {
  const budgetMs = opts.budgetMs ?? 500;
  const need = opts.consecutive ?? 3;
  const raf = opts.raf ?? ((cb) => requestAnimationFrame(cb));
  const caf = opts.caf ?? ((id) => cancelAnimationFrame(id));
  let id = 0;
  let running = false;
  let last: number | null = null;
  let streak = 0;

  return {
    start(onStall) {
      running = true;
      last = null;
      streak = 0;
      const loop = (ts: number): void => {
        if (!running) return;
        if (last !== null) {
          const gap = ts - last;
          if (gap > budgetMs) {
            streak += 1;
            if (streak >= need) {
              onStall({ blownBudgetMs: gap, consecutive: streak });
              streak = 0;
            }
          } else {
            streak = 0;
          }
        }
        last = ts;
        id = raf(loop);
      };
      id = raf(loop);
    },
    stop() {
      running = false;
      caf(id);
    },
  };
}
