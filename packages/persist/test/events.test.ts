import { describe, it, expect } from "vitest";
import { memoryDriver } from "../src/idb/memory.js";
import { openTrellisDb } from "../src/db.js";
import { appendEvents, recentEvents } from "../src/events.js";
import type { BehavioralEvent } from "@trellis/schema";

function ev(id: string, stepId: string, ts: string, seq: number): BehavioralEvent {
  return { id, learnerId: "L", sessionId: "s", seq, stepId, ts, type: "editor_change", payload: {} };
}

describe("appendEvents / recentEvents", () => {
  it("appends events durably in one transaction", async () => {
    const db = await openTrellisDb(memoryDriver(), { idGen: () => "L" });
    await appendEvents(db, [ev("e1", "s1", "2026-06-08T00:00:01Z", 0), ev("e2", "s1", "2026-06-08T00:00:02Z", 1)]);
    const all = await recentEvents(db, {});
    expect(all.map((e) => e.id).sort()).toEqual(["e1", "e2"]);
  });

  it("returns the most recent events first, limited", async () => {
    const db = await openTrellisDb(memoryDriver(), { idGen: () => "L" });
    await appendEvents(db, [
      ev("e1", "s1", "2026-06-08T00:00:01Z", 0),
      ev("e2", "s1", "2026-06-08T00:00:02Z", 1),
      ev("e3", "s1", "2026-06-08T00:00:03Z", 2),
    ]);
    const recent = await recentEvents(db, { limit: 2 });
    expect(recent.map((e) => e.id)).toEqual(["e3", "e2"]); // newest-first
  });

  it("filters by stepId via the by_step_ts index", async () => {
    const db = await openTrellisDb(memoryDriver(), { idGen: () => "L" });
    await appendEvents(db, [
      ev("e1", "s1", "2026-06-08T00:00:01Z", 0),
      ev("e2", "s2", "2026-06-08T00:00:02Z", 1),
      ev("e3", "s1", "2026-06-08T00:00:03Z", 2),
    ]);
    const s1 = await recentEvents(db, { stepId: "s1" });
    expect(s1.map((e) => e.id)).toEqual(["e3", "e1"]); // s1 only, newest-first
  });
});
