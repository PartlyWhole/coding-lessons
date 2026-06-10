// Defining gate (c): each §11.3 rule fires on its textbook sequence and NOT on near-misses
// (mutation-tested predicates). Plus priority, dedupe, and detach behavior of the headless
// scaffolder (D5 — no visual affordance here; the action seam is the product).
import { describe, it, expect } from "vitest";
import type { BehavioralEvent } from "@trellis/schema";
import {
  DEFAULT_SCAFFOLD_CONFIG,
  ruleWrongPredictThenCorrectRun,
  ruleThreeFailStreak,
  ruleRapidResubmit,
  createProactiveScaffolder,
  type ScaffoldAction,
} from "../src/scaffolder.js";
import { createEventBus } from "../src/bus.js";
import type { TelemetryPersist } from "../src/ports.js";
import { FakeClock } from "./helpers/fake.js";

let seqCounter = 1000;
function row(p: Partial<BehavioralEvent> & { type: BehavioralEvent["type"] }): BehavioralEvent {
  return {
    id: `r${seqCounter}`,
    learnerId: "L",
    sessionId: "s",
    seq: seqCounter--,
    stepId: "s1",
    ts: "2026-06-10T00:00:00.000Z",
    payload: {},
    ...p,
  };
}
function sub(opts: { correct: boolean; stepId?: string; stepKind?: string; proxy?: number; ts?: string; failStreak?: number }): BehavioralEvent {
  return row({
    type: "submission",
    stepId: opts.stepId ?? "s1",
    ts: opts.ts ?? "2026-06-10T00:00:00.000Z",
    payload: {
      correct: opts.correct,
      stepKind: opts.stepKind ?? "build",
      ...(opts.proxy !== undefined ? { editDistanceProxy: opts.proxy } : {}),
      ...(opts.failStreak !== undefined ? { failStreak: opts.failStreak } : {}),
    },
  });
}

const cfg = DEFAULT_SCAFFOLD_CONFIG;

describe("rule predicates (pure, newest-first rows; gate c mutations)", () => {
  it("wrong_predict_then_correct_run: textbook fires; correct-predict and wrong→wrong near-misses do not", () => {
    expect(ruleWrongPredictThenCorrectRun([sub({ correct: true }), sub({ correct: false, stepKind: "predict" })])).toBe(true);
    expect(ruleWrongPredictThenCorrectRun([row({ type: "run" }), sub({ correct: false, stepKind: "predict" })])).toBe(true);
    // near-misses
    expect(ruleWrongPredictThenCorrectRun([sub({ correct: true }), sub({ correct: true, stepKind: "predict" })])).toBe(false);
    expect(ruleWrongPredictThenCorrectRun([sub({ correct: false }), sub({ correct: false, stepKind: "predict" })])).toBe(false);
    expect(ruleWrongPredictThenCorrectRun([sub({ correct: true }), sub({ correct: false, stepKind: "build" })])).toBe(false);
    expect(ruleWrongPredictThenCorrectRun([])).toBe(false);
  });

  it("three_fail_streak: fires on exactly 3 trailing wrongs on the step; NOT on 2; NOT on wrong-correct-wrong-wrong", () => {
    const w = (): BehavioralEvent => sub({ correct: false });
    expect(ruleThreeFailStreak([w(), w(), w()], "s1", cfg)).toBe(true);
    expect(ruleThreeFailStreak([w(), w()], "s1", cfg)).toBe(false);
    // newest-first: wrong, wrong, correct, wrong → trailing streak 2
    expect(ruleThreeFailStreak([w(), w(), sub({ correct: true }), w()], "s1", cfg)).toBe(false);
    // other-step wrongs don't count toward this step's streak
    expect(ruleThreeFailStreak([w(), w(), sub({ correct: false, stepId: "other" })], "s1", cfg)).toBe(false);
    // 4 wrongs still fire (>= threshold)
    expect(ruleThreeFailStreak([w(), w(), w(), w()], "s1", cfg)).toBe(true);
  });

  it("rapid_resubmit: fires on 2 wrong submissions 19s apart with proxy 0; NOT 21s; NOT proxy 5; NOT proxy absent; NOT when newest is correct", () => {
    const t0 = "2026-06-10T00:00:00.000Z";
    const t19 = "2026-06-10T00:00:19.000Z";
    const t21 = "2026-06-10T00:00:21.000Z";
    expect(ruleRapidResubmit([sub({ correct: false, ts: t19, proxy: 0 }), sub({ correct: false, ts: t0 })], "s1", cfg)).toBe(true);
    expect(ruleRapidResubmit([sub({ correct: false, ts: t21, proxy: 0 }), sub({ correct: false, ts: t0 })], "s1", cfg)).toBe(false);
    expect(ruleRapidResubmit([sub({ correct: false, ts: t19, proxy: 5 }), sub({ correct: false, ts: t0 })], "s1", cfg)).toBe(false);
    // proxy absent (E2 unlanded / no editor data) → deterministic non-fire, never a guess
    expect(ruleRapidResubmit([sub({ correct: false, ts: t19 }), sub({ correct: false, ts: t0 })], "s1", cfg)).toBe(false);
    expect(ruleRapidResubmit([sub({ correct: true, ts: t19, proxy: 0 }), sub({ correct: false, ts: t0 })], "s1", cfg)).toBe(false);
    // a single submission can never be a RE-submit
    expect(ruleRapidResubmit([sub({ correct: false, ts: t19, proxy: 0 })], "s1", cfg)).toBe(false);
  });
});

interface SHarness {
  bus: ReturnType<typeof createEventBus>;
  clock: FakeClock;
  actions: ScaffoldAction[];
  setRows: (rows: BehavioralEvent[]) => void;
  detach: () => void;
}

function sHarness(): SHarness {
  const bus = createEventBus();
  const clock = new FakeClock();
  const actions: ScaffoldAction[] = [];
  let rows: BehavioralEvent[] = [];
  const persist: TelemetryPersist = {
    appendEvents: async () => undefined,
    recentEvents: async () => rows,
  };
  const detach = createProactiveScaffolder({
    bus,
    persist,
    clock,
    config: DEFAULT_SCAFFOLD_CONFIG,
    onAction: (a) => actions.push(a),
  });
  return { bus, clock, actions, setRows: (r) => (rows = r), detach };
}

const settle = (): Promise<void> => new Promise((r) => setTimeout(r, 0));
const wrongDiag = { correct: false, attribution: "slip" } as never;

describe("createProactiveScaffolder (headless seam)", () => {
  it("evaluates on submission and proposes the three_fail_streak auto-advance (textbook)", async () => {
    const h = sHarness();
    h.setRows([sub({ correct: false }), sub({ correct: false }), sub({ correct: false })]);
    h.bus.emit({ t: "submission", stepId: "s1", diagnosis: wrongDiag });
    await settle();
    expect(h.actions).toEqual([{ rule: "three_fail_streak", stepId: "s1", action: "advance_hint_one_level" }]);
  });

  it("priority: a state satisfying wrong_predict AND three_fail proposes ONLY wrong_predict (highest wins)", async () => {
    const h = sHarness();
    h.setRows([
      sub({ correct: true }), // correct outcome…
      sub({ correct: false, stepKind: "predict" }), // …right after a wrong predict
      sub({ correct: false }),
      sub({ correct: false }),
      sub({ correct: false }),
    ]);
    h.bus.emit({ t: "submission", stepId: "s1", diagnosis: { correct: true, attribution: "correct" } as never });
    await settle();
    expect(h.actions).toEqual([{ rule: "wrong_predict_then_correct_run", stepId: "s1", action: "offer_hint", level: 1 }]);
  });

  it("dedupe: the same (rule, stepId) does not re-fire on a later submission; step_enter resets it", async () => {
    const h = sHarness();
    h.setRows([sub({ correct: false }), sub({ correct: false }), sub({ correct: false })]);
    h.bus.emit({ t: "submission", stepId: "s1", diagnosis: wrongDiag });
    await settle();
    h.setRows([sub({ correct: false }), sub({ correct: false }), sub({ correct: false }), sub({ correct: false })]);
    h.bus.emit({ t: "submission", stepId: "s1", diagnosis: wrongDiag }); // 4th wrong: deduped
    await settle();
    expect(h.actions).toHaveLength(1);
    h.bus.emit({ t: "step_enter", stepId: "s1", kind: "build" }); // re-entering the step resets
    await settle(); // baseline anchored at 4 persisted submissions
    h.setRows([sub({ correct: false }), sub({ correct: false }), sub({ correct: false }), sub({ correct: false }), sub({ correct: false })]);
    h.bus.emit({ t: "submission", stepId: "s1", diagnosis: wrongDiag }); // 5th row visible = baseline+1
    await settle();
    expect(h.actions).toHaveLength(2);
  });

  it("idle rule: own IdleDetector proposes nudge_peek_or_hint after the threshold; deduped until step_enter", async () => {
    const h = sHarness();
    h.bus.emit({ t: "step_enter", stepId: "s1", kind: "build" });
    h.clock.tick(90_000);
    await settle();
    expect(h.actions).toEqual([{ rule: "idle", stepId: "s1", action: "nudge_peek_or_hint" }]);
    // activity, then idle again on the SAME step: deduped (suggestions only, never nagging)
    h.bus.emit({ t: "editor_change", stepId: "s1", length: 1, hash: "h" });
    h.clock.tick(90_000);
    await settle();
    expect(h.actions).toHaveLength(1);
    // a new step re-arms the idle proposal
    h.bus.emit({ t: "step_enter", stepId: "s2", kind: "build" });
    h.clock.tick(90_000);
    await settle();
    expect(h.actions).toHaveLength(2);
    expect(h.actions[1]).toEqual({ rule: "idle", stepId: "s2", action: "nudge_peek_or_hint" });
  });

  it("near-miss: two wrongs propose nothing (no rule fires, onAction never called)", async () => {
    const h = sHarness();
    h.setRows([sub({ correct: false }), sub({ correct: false })]);
    h.bus.emit({ t: "submission", stepId: "s1", diagnosis: wrongDiag });
    await settle();
    expect(h.actions).toEqual([]);
  });

  it("detach unsubscribes and disposes the idle detector", async () => {
    const h = sHarness();
    h.bus.emit({ t: "step_enter", stepId: "s1", kind: "build" });
    h.detach();
    h.setRows([sub({ correct: false }), sub({ correct: false }), sub({ correct: false })]);
    h.bus.emit({ t: "submission", stepId: "s1", diagnosis: wrongDiag });
    h.clock.tick(600_000);
    await settle();
    expect(h.actions).toEqual([]);
  });

  it("D5 read-after-write: waits (injected-clock retries) until the just-flushed submission is VISIBLE before evaluating — never fires off stale state", async () => {
    // Eventually-consistent persist: rows become visible only after `lag` extra reads,
    // modeling memoryDriver/IndexedDB commit latency behind the bus event.
    const bus = createEventBus();
    const clock = new FakeClock();
    const actions: ScaffoldAction[] = [];
    let committed: BehavioralEvent[] = [];
    let pending: { rows: BehavioralEvent[]; lag: number } | null = null;
    const persist: TelemetryPersist = {
      appendEvents: async () => undefined,
      recentEvents: async (q) => {
        if (pending !== null && --pending.lag <= 0) {
          committed = pending.rows;
          pending = null;
        }
        return q.stepId !== undefined ? committed.filter((r) => r.stepId === q.stepId) : committed;
      },
    };
    createProactiveScaffolder({ bus, persist, clock, config: DEFAULT_SCAFFOLD_CONFIG, onAction: (a) => actions.push(a) });

    bus.emit({ t: "step_enter", stepId: "s1", kind: "recognize" }); // baseline fetch: 0 rows
    await settle();
    // two wrongs flow through normally (each immediately visible)…
    committed = [sub({ correct: false })];
    bus.emit({ t: "submission", stepId: "s1", diagnosis: wrongDiag });
    await settle();
    committed = [sub({ correct: false }), sub({ correct: false })];
    bus.emit({ t: "submission", stepId: "s1", diagnosis: wrongDiag });
    await settle();
    expect(actions).toEqual([]); // 2 wrongs: nothing
    // …then the THIRD is flushed but its commit lags behind three reads
    pending = { rows: [sub({ correct: false }), sub({ correct: false }), sub({ correct: false })], lag: 3 };
    bus.emit({ t: "submission", stepId: "s1", diagnosis: wrongDiag });
    await settle();
    expect(actions).toEqual([]); // stale state (2 wrongs visible) must NOT fire
    for (let i = 0; i < 6; i++) {
      clock.tick(0); // each retry is an injected-clock timer, never wall time
      await settle();
    }
    expect(actions).toEqual([{ rule: "three_fail_streak", stepId: "s1", action: "advance_hint_one_level" }]);
  });

  it("end-to-end with attachTelemetry + real memoryDriver: 3 wrong submissions on one bus → exactly one three_fail_streak action", async () => {
    const { memoryDriver, openTrellisDb, appendEvents, recentEvents } = await import("@trellis/persist");
    const { attachTelemetry } = await import("../src/attach.js");
    const { DEFAULT_CAPTURE_POLICY } = await import("../src/policy.js");
    const { FakeListenerTarget, seqIds } = await import("./helpers/fake.js");
    const bus = createEventBus();
    const clock = new FakeClock();
    const db = await openTrellisDb(memoryDriver(), { idGen: () => "L" });
    const port: TelemetryPersist = {
      appendEvents: (ev) => appendEvents(db, ev),
      recentEvents: (q) => recentEvents(db, q),
    };
    const actions: ScaffoldAction[] = [];
    attachTelemetry({
      bus, persist: port, clock, ids: seqIds(), policy: DEFAULT_CAPTURE_POLICY,
      learnerId: "L", target: new FakeListenerTarget(), isHidden: () => false,
    });
    createProactiveScaffolder({ bus, persist: port, clock, config: DEFAULT_SCAFFOLD_CONFIG, onAction: (a) => actions.push(a) });

    bus.emit({ t: "step_enter", stepId: "r", kind: "recognize" });
    for (let i = 0; i < 3; i++) {
      bus.emit({ t: "submission", stepId: "r", diagnosis: wrongDiag });
      for (let j = 0; j < 4; j++) {
        await settle();
        clock.tick(0);
      }
      await settle();
    }
    expect(actions).toEqual([{ rule: "three_fail_streak", stepId: "r", action: "advance_hint_one_level" }]);
  });

  it("an onAction that throws never breaks the emitting caller (bus emit stays safe)", async () => {
    const bus = createEventBus();
    const clock = new FakeClock();
    const persist: TelemetryPersist = {
      appendEvents: async () => undefined,
      recentEvents: async () => [sub({ correct: false }), sub({ correct: false }), sub({ correct: false })],
    };
    createProactiveScaffolder({
      bus,
      persist,
      clock,
      config: DEFAULT_SCAFFOLD_CONFIG,
      onAction: () => {
        throw new Error("ui bug");
      },
    });
    expect(() => bus.emit({ t: "submission", stepId: "s1", diagnosis: wrongDiag })).not.toThrow();
    await settle(); // the async evaluation must also not produce an unhandled rejection
  });
});
