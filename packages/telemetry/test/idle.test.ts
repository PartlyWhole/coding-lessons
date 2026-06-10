import { describe, it, expect } from "vitest";
import { createIdleDetector, type IdleSignal } from "../src/idle.js";
import { FakeClock } from "./helpers/fake.js";

function harness(thresholdMs = 90_000): { clock: FakeClock; signals: IdleSignal[]; det: ReturnType<typeof createIdleDetector> } {
  const clock = new FakeClock();
  const signals: IdleSignal[] = [];
  const det = createIdleDetector({ clock, thresholdMs, onSignal: (s) => signals.push(s) });
  return { clock, signals, det };
}

describe("IdleDetector (§11.1 — injected clock, defining gate b)", () => {
  it("no activity for thresholdMs → exactly one idle signal with {durationMs: 90000}", () => {
    const { clock, signals, det } = harness();
    det.reset("s1");
    clock.tick(90_000);
    expect(signals).toEqual([{ kind: "idle", stepId: "s1", durationMs: 90_000 }]);
    clock.tick(500_000); // stays quiet: no timer re-arm without activity
    expect(signals).toHaveLength(1);
  });

  it("a reset before the threshold re-arms: 89999 → reset → 89999 → nothing; +1ms → idle", () => {
    const { clock, signals, det } = harness();
    det.reset("s1");
    clock.tick(89_999);
    det.reset("s1");
    clock.tick(89_999);
    expect(signals).toHaveLength(0);
    clock.tick(1);
    expect(signals).toEqual([{ kind: "idle", stepId: "s1", durationMs: 90_000 }]);
  });

  it("resumed activity after idle emits dwell with the FULL gap since last activity", () => {
    const { clock, signals, det } = harness();
    det.reset("s1");
    clock.tick(90_000); // idle fires
    clock.tick(30_000); // learner still away
    det.reset("s1"); // activity resumes
    expect(signals).toEqual([
      { kind: "idle", stepId: "s1", durationMs: 90_000 },
      { kind: "dwell", stepId: "s1", durationMs: 120_000 },
    ]);
    // and the detector is re-armed for the next idle
    clock.tick(90_000);
    expect(signals).toHaveLength(3);
    expect(signals[2]).toEqual({ kind: "idle", stepId: "s1", durationMs: 90_000 });
  });

  it("activity before the threshold emits NO dwell (dwell is the return-from-idle signal only)", () => {
    const { clock, signals, det } = harness();
    det.reset("s1");
    clock.tick(50_000);
    det.reset("s1");
    expect(signals).toHaveLength(0);
  });

  it("idle is attributed to the step active at the time of last activity", () => {
    const { clock, signals, det } = harness();
    det.reset("s1");
    clock.tick(10_000);
    det.reset("s2"); // step advanced; activity on s2
    clock.tick(90_000);
    expect(signals).toEqual([{ kind: "idle", stepId: "s2", durationMs: 90_000 }]);
  });

  it("dispose() clears the timer — nothing fires after", () => {
    const { clock, signals, det } = harness();
    det.reset("s1");
    det.dispose();
    clock.tick(1_000_000);
    expect(signals).toHaveLength(0);
  });
});
