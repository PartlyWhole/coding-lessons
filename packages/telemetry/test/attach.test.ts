// Defining gates (a), (d), (e) at unit/integration level — real persist package
// (memoryDriver) behind the TelemetryPersist port; FakeClock drives all time.
import { describe, it, expect } from "vitest";
import type { BehavioralEvent } from "@trellis/schema";
import { memoryDriver, openTrellisDb, appendEvents, recentEvents, type TrellisDb } from "@trellis/persist";
import { attachTelemetry } from "../src/attach.js";
import { createEventBus } from "../src/bus.js";
import { DEFAULT_CAPTURE_POLICY } from "../src/policy.js";
import type { TelemetryPersist } from "../src/ports.js";
import { FakeClock, FakeListenerTarget, seqIds } from "./helpers/fake.js";

interface Harness {
  bus: ReturnType<typeof createEventBus>;
  clock: FakeClock;
  target: FakeListenerTarget;
  db: TrellisDb;
  appendCalls: number;
  detach: () => void;
  allRows: () => Promise<BehavioralEvent[]>;
}

async function harness(policy = DEFAULT_CAPTURE_POLICY): Promise<Harness> {
  const bus = createEventBus();
  const clock = new FakeClock();
  const target = new FakeListenerTarget();
  const db = await openTrellisDb(memoryDriver(), { idGen: () => "L" });
  const h: Partial<Harness> = { bus, clock, target, db };
  h.appendCalls = 0;
  const persist: TelemetryPersist = {
    appendEvents: (ev) => {
      h.appendCalls = (h.appendCalls ?? 0) + 1;
      return appendEvents(db, ev);
    },
    recentEvents: (q) => recentEvents(db, q),
  };
  h.detach = attachTelemetry({
    bus,
    persist,
    clock,
    ids: seqIds(),
    policy,
    learnerId: "L",
    target,
    isHidden: () => target.hidden,
  });
  h.allRows = async () => {
    const rows = await recentEvents(db, { limit: 1000 });
    return rows.slice().sort((a, b) => a.seq - b.seq);
  };
  return h as Harness;
}

const settle = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

describe("attachTelemetry (§11.1 TelemetryRecorder.attach — defining gates a/d/e)", () => {
  it("(a) scripted UiEvent sequence → exact expected rows, gap-free seq, batched flushes incl. pagehide", async () => {
    const h = await harness();
    const wrong = { correct: false, attribution: "slip" } as never;
    const right = { correct: true, attribution: "correct" } as never;

    h.bus.emit({ t: "session_start" });
    h.bus.emit({ t: "step_enter", stepId: "p1", kind: "predict" });
    h.bus.emit({ t: "submission", stepId: "p1", diagnosis: wrong });
    h.bus.emit({ t: "predict_answer", stepId: "p1", correct: false }); // E4 fold: 0 rows
    h.bus.emit({ t: "step_release", stepId: "p1" });
    h.bus.emit({ t: "step_enter", stepId: "b1", kind: "build" });
    h.bus.emit({ t: "editor_change", stepId: "b1", length: 3, hash: "h1" });
    h.bus.emit({ t: "editor_change", stepId: "b1", length: 5, hash: "h2" });
    h.bus.emit({ t: "editor_change", stepId: "b1", length: 9, hash: "h3" });
    h.bus.emit({ t: "submission", stepId: "b1", diagnosis: wrong });
    h.bus.emit({ t: "submission", stepId: "b1", diagnosis: wrong });
    h.bus.emit({ t: "hint_request", stepId: "b1", level: 1 });
    h.bus.emit({ t: "submission", stepId: "b1", diagnosis: right });
    h.bus.emit({ t: "step_release", stepId: "b1" });
    h.target.hidden = true;
    h.target.fire("pagehide"); // simulated close: drains whatever is still buffered
    await settle();

    const rows = await h.allRows();
    expect(rows.map((r) => r.type)).toEqual([
      "session_start",
      "step_enter",
      "submission",
      "step_release",
      "step_enter",
      "editor_change",
      "editor_change",
      "editor_change",
      "submission",
      "submission",
      "hint_requested",
      "submission",
      "step_release",
    ]);
    expect(rows.map((r) => r.seq)).toEqual(rows.map((_, i) => i)); // gap-free 0..n
    expect(rows[0]!.stepId).toBe(""); // sentinel
    // predict fold: the p1 submission row carries the predict outcome
    const predictSub = rows[2]!.payload as Record<string, unknown>;
    expect(predictSub["stepKind"]).toBe("predict");
    expect(predictSub["correct"]).toBe(false);
    // build fail streak on the two wrongs then reset on correct
    const buildSubs = rows.filter((r) => r.type === "submission" && r.stepId === "b1");
    expect(buildSubs.map((r) => (r.payload as Record<string, unknown>)["failStreak"])).toEqual([1, 2, 0]);
    // batched: 14 UiEvents → 13 rows, in FEWER appendEvents calls than rows
    expect(h.appendCalls).toBeGreaterThan(0);
    expect(h.appendCalls).toBeLessThan(rows.length);
  });

  it("(a-idle) FakeClock ticks past idleThresholdMs mid-script → an idle row appears (and dwell on return)", async () => {
    const h = await harness();
    h.bus.emit({ t: "session_start" });
    h.bus.emit({ t: "step_enter", stepId: "s1", kind: "build" });
    h.clock.tick(90_000);
    h.bus.emit({ t: "editor_change", stepId: "s1", length: 1, hash: "h" }); // return → dwell
    h.target.hidden = true;
    h.target.fire("visibilitychange");
    await settle();
    const rows = await h.allRows();
    const types = rows.map((r) => r.type);
    expect(types).toContain("idle");
    expect(types).toContain("dwell");
    const idleRow = rows.find((r) => r.type === "idle")!;
    expect(idleRow.stepId).toBe("s1");
    expect(idleRow.payload).toEqual({ durationMs: 90_000 });
    expect(rows.map((r) => r.seq)).toEqual(rows.map((_, i) => i)); // detector rows share the pipeline
  });

  it("(d) a throwing OTHER subscriber cannot break recording, and telemetry failures cannot break the emitter", async () => {
    const h = await harness();
    h.bus.subscribe(() => {
      throw new Error("someone else's bug");
    });
    expect(() => h.bus.emit({ t: "step_enter", stepId: "s1", kind: "build" })).not.toThrow();
    h.target.hidden = true;
    h.target.fire("pagehide");
    await settle();
    expect((await h.allRows()).map((r) => r.type)).toEqual(["step_enter"]);
  });

  it("(e) enabled:false → the master switch never subscribes: zero rows ever; detach is a no-op", async () => {
    const h = await harness({ ...DEFAULT_CAPTURE_POLICY, enabled: false });
    h.bus.emit({ t: "session_start" });
    h.bus.emit({ t: "step_enter", stepId: "s1", kind: "build" });
    h.bus.emit({ t: "submission", stepId: "s1", diagnosis: { correct: true, attribution: "correct" } as never });
    h.target.hidden = true;
    h.target.fire("pagehide");
    h.clock.tick(600_000);
    await settle();
    expect(await h.allRows()).toEqual([]);
    expect(h.target.listenerCount()).toBe(0); // no buffer listeners either
    expect(() => h.detach()).not.toThrow();
  });

  it("(e) captureEditorText:false (default) → planted source text never appears in any persisted row", async () => {
    const h = await harness();
    const SECRET = "while True: launch_missiles()";
    h.bus.emit({ t: "step_enter", stepId: "s1", kind: "build" });
    h.bus.emit({ t: "editor_change", stepId: "s1", length: SECRET.length, hash: "deadbeef" });
    h.bus.emit({
      t: "submission",
      stepId: "s1",
      diagnosis: { correct: false, attribution: "slip", signals: { ran: true, stdout: SECRET, wallMs: 1 } } as never,
    });
    h.target.hidden = true;
    h.target.fire("pagehide");
    await settle();
    const rows = await h.allRows();
    expect(rows.length).toBeGreaterThan(0);
    expect(JSON.stringify(rows)).not.toContain(SECRET);
  });

  it("detach unsubscribes, disposes idle+buffer, and a final flush drains pending rows", async () => {
    const h = await harness();
    h.bus.emit({ t: "step_enter", stepId: "s1", kind: "build" });
    h.bus.emit({ t: "editor_change", stepId: "s1", length: 1, hash: "h" }); // still buffered
    h.detach();
    await settle();
    const rows = await h.allRows();
    expect(rows.map((r) => r.type)).toEqual(["step_enter", "editor_change"]); // drained on detach
    // after detach: no listeners, no recording, no idle firing
    expect(h.target.listenerCount()).toBe(0);
    h.bus.emit({ t: "peek_back", stepId: "s1" });
    h.clock.tick(600_000);
    await settle();
    expect((await h.allRows()).map((r) => r.type)).toEqual(["step_enter", "editor_change"]);
  });

  it("submission rows flush promptly (read-after-write seam for the scaffolder, D5)", async () => {
    const h = await harness();
    h.bus.emit({ t: "step_enter", stepId: "s1", kind: "build" });
    h.bus.emit({ t: "submission", stepId: "s1", diagnosis: { correct: false, attribution: "slip" } as never });
    await settle(); // NO pagehide, NO interval tick — the submission itself triggered the flush
    const rows = await h.allRows();
    expect(rows.map((r) => r.type)).toContain("submission");
  });
});
