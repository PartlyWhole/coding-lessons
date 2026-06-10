import { describe, it, expect } from "vitest";
import { createWatchdog } from "../src/watchdog.js";

function fakeRaf() {
  const cbs: FrameRequestCallback[] = [];
  let cancelled: number[] = [];
  return {
    raf: (cb: FrameRequestCallback) => {
      cbs.push(cb);
      return cbs.length;
    },
    caf: (id: number) => {
      cancelled.push(id);
    },
    tick(ts: number) {
      const cb = cbs.shift();
      if (cb) cb(ts);
    },
    get cancelledIds() {
      return cancelled;
    },
  };
}

describe("rAF watchdog (§17.5 guard 3)", () => {
  it("fires onStall only after N consecutive blown frame budgets", () => {
    const f = fakeRaf();
    const stalls: number[] = [];
    const dog = createWatchdog({ budgetMs: 500, consecutive: 3, raf: f.raf, caf: f.caf });
    dog.start((e) => stalls.push(e.consecutive));
    f.tick(0);
    f.tick(600);
    f.tick(1200); // 2 blown gaps — not yet
    expect(stalls).toEqual([]);
    f.tick(1800); // 3rd consecutive blown gap
    expect(stalls).toEqual([3]);
    dog.stop();
  });
  it("a healthy frame resets the streak", () => {
    const f = fakeRaf();
    const stalls: unknown[] = [];
    const dog = createWatchdog({ budgetMs: 500, consecutive: 2, raf: f.raf, caf: f.caf });
    dog.start(() => stalls.push(1));
    f.tick(0);
    f.tick(600); // blown
    f.tick(620); // healthy
    f.tick(1300); // blown — never 2 in a row
    expect(stalls).toEqual([]);
    dog.stop();
  });
  it("stop() prevents further observation (no stall after stop even on a huge gap)", () => {
    const f = fakeRaf();
    const stalls: unknown[] = [];
    const dog = createWatchdog({ budgetMs: 500, consecutive: 1, raf: f.raf, caf: f.caf });
    dog.start(() => stalls.push(1));
    f.tick(0);
    dog.stop();
    f.tick(99999);
    expect(stalls).toEqual([]);
  });
});
