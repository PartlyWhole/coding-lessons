import { describe, it, expect } from "vitest";
import { realClock, type Clock } from "../src/clock.js";

describe("realClock", () => {
  it("now() is monotonic-ish and returns a number", () => {
    const a = realClock.now();
    expect(typeof a).toBe("number");
    expect(realClock.now()).toBeGreaterThanOrEqual(a);
  });

  it("setTimer fires after the delay and clearTimer cancels it", async () => {
    let fired = false;
    const t = realClock.setTimer(() => { fired = true; }, 5);
    await new Promise((r) => setTimeout(r, 20));
    expect(fired).toBe(true);

    let fired2 = false;
    const t2 = realClock.setTimer(() => { fired2 = true; }, 5);
    realClock.clearTimer(t2);
    await new Promise((r) => setTimeout(r, 20));
    expect(fired2).toBe(false);
    void t;
  });

  it("satisfies the Clock interface", () => {
    const c: Clock = realClock;
    expect(typeof c.now).toBe("function");
  });
});
