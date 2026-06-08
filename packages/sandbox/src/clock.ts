// An injectable clock so the watchdog and wallMs are deterministic under test.
// Tests inject a FakeClock (test/mock-worker.ts); production uses realClock.

export type Timer = { readonly __timer: unique symbol } | object;

export interface Clock {
  now(): number;
  setTimer(fn: () => void, ms: number): Timer;
  clearTimer(t: Timer): void;
}

export const realClock: Clock = {
  now: () => (typeof performance !== "undefined" ? performance.now() : Date.now()),
  setTimer: (fn, ms) => setTimeout(fn, ms) as unknown as Timer,
  clearTimer: (t) => clearTimeout(t as unknown as ReturnType<typeof setTimeout>),
};
