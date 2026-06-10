import { describe, it, expect } from "vitest";
import type { BehavioralEvent } from "@trellis/schema";
import { createEventBuffer } from "../src/buffer.js";
import { FakeClock, FakeListenerTarget } from "./helpers/fake.js";

function row(seq: number): BehavioralEvent {
  return { id: `id-${seq}`, learnerId: "L", sessionId: "s", seq, stepId: "s1", ts: "2026-06-10T00:00:00.000Z", type: "editor_change", payload: {} };
}

interface Harness {
  clock: FakeClock;
  target: FakeListenerTarget;
  batches: BehavioralEvent[][];
  buf: ReturnType<typeof createEventBuffer>;
  failNext: { fail: boolean };
}

function harness(opts?: { maxBatch?: number; flushIntervalMs?: number }): Harness {
  const clock = new FakeClock();
  const target = new FakeListenerTarget();
  const batches: BehavioralEvent[][] = [];
  const failNext = { fail: false };
  const buf = createEventBuffer({
    clock,
    target,
    isHidden: () => target.hidden,
    sink: async (rows) => {
      if (failNext.fail) {
        failNext.fail = false;
        throw new Error("idb closed");
      }
      batches.push(rows);
    },
    ...(opts?.maxBatch !== undefined ? { maxBatch: opts.maxBatch } : {}),
    ...(opts?.flushIntervalMs !== undefined ? { flushIntervalMs: opts.flushIntervalMs } : {}),
  });
  return { clock, target, batches, buf, failNext };
}

const settle = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

describe("EventBuffer (§11.1 D7 — batched, loss-free)", () => {
  it("no sink call per single row below thresholds (no write-per-keystroke)", async () => {
    const h = harness();
    h.buf.push(row(0));
    h.buf.push(row(1));
    await settle();
    expect(h.batches).toHaveLength(0);
  });

  it("flushes when size reaches maxBatch", async () => {
    const h = harness({ maxBatch: 3 });
    h.buf.push(row(0));
    h.buf.push(row(1));
    h.buf.push(row(2));
    await settle();
    expect(h.batches).toEqual([[row(0), row(1), row(2)]]);
  });

  it("interval flush fires at flushIntervalMs and the timer is armed only while non-empty", async () => {
    const h = harness();
    h.clock.tick(60_000); // empty: no timer armed, nothing happens
    await settle();
    expect(h.batches).toHaveLength(0);
    h.buf.push(row(0));
    h.clock.tick(4_999);
    await settle();
    expect(h.batches).toHaveLength(0);
    h.clock.tick(1);
    await settle();
    expect(h.batches).toEqual([[row(0)]]);
    // after the flush the buffer is empty again — advancing time does NOT re-flush
    h.clock.tick(60_000);
    await settle();
    expect(h.batches).toHaveLength(1);
  });

  it("pagehide forces a flush; visibilitychange flushes only when hidden", async () => {
    const h = harness();
    h.buf.push(row(0));
    h.target.hidden = false;
    h.target.fire("visibilitychange"); // visible: not a flush trigger
    await settle();
    expect(h.batches).toHaveLength(0);
    h.target.hidden = true;
    h.target.fire("visibilitychange");
    await settle();
    expect(h.batches).toEqual([[row(0)]]);
    h.buf.push(row(1));
    h.target.fire("pagehide");
    await settle();
    expect(h.batches).toEqual([[row(0)], [row(1)]]);
  });

  it("a rejecting sink re-queues the batch at the FRONT: next flush delivers all rows once, in seq order", async () => {
    const h = harness();
    h.buf.push(row(0));
    h.buf.push(row(1));
    h.failNext.fail = true;
    await h.buf.flush(); // fails; rows must be retained
    expect(h.batches).toHaveLength(0);
    h.buf.push(row(2)); // arrived while the failed rows wait
    await h.buf.flush();
    expect(h.batches).toEqual([[row(0), row(1), row(2)]]); // no loss, no dup, seq order
  });

  it("flush never rejects into the caller (a closing-db error is contained)", async () => {
    const h = harness();
    h.buf.push(row(0));
    h.failNext.fail = true;
    await expect(h.buf.flush()).resolves.toBeUndefined();
  });

  it("dispose() removes both listeners and clears the timer", async () => {
    const h = harness();
    h.buf.push(row(0));
    expect(h.target.listenerCount()).toBe(2);
    h.buf.dispose();
    expect(h.target.listenerCount()).toBe(0);
    h.clock.tick(60_000);
    await settle();
    expect(h.batches).toHaveLength(0); // timer cleared; nothing flushed by time
  });
});
