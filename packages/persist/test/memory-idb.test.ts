import { describe, it, expect } from "vitest";
import { memoryDriver, FaultController } from "../src/idb/memory.js";
import type { StoreSpec } from "../src/idb/types.js";

const SPECS: StoreSpec[] = [
  { name: "a", keyPath: "id" },
  { name: "b", keyPath: "id" },
  { name: "evt", keyPath: "id", indexes: [{ name: "by_step_ts", keyPath: ["stepId", "ts"] }] },
];

describe("memoryDriver", () => {
  it("commits a write-only transaction across multiple stores", async () => {
    const driver = memoryDriver();
    const db = await driver.open("trellis", 1, SPECS);
    await db.tx(["a", "b"], "readwrite", async (tx) => {
      await tx.store("a").put({ id: "1", v: "x" });
      await tx.store("b").put({ id: "2", v: "y" });
    });
    const got = await db.tx(["a"], "readonly", async (tx) => tx.store("a").get("1"));
    expect(got).toEqual({ id: "1", v: "x" });
  });

  it("rolls back ALL stores when the body throws (all-or-nothing)", async () => {
    const driver = memoryDriver();
    const db = await driver.open("trellis", 1, SPECS);
    await expect(
      db.tx(["a", "b"], "readwrite", async (tx) => {
        await tx.store("a").put({ id: "1", v: "x" });
        await tx.store("b").put({ id: "2", v: "y" });
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    const a = await db.tx(["a", "b"], "readonly", async (tx) => [
      await tx.store("a").getAll(),
      await tx.store("b").getAll(),
    ]);
    expect(a).toEqual([[], []]);
  });

  it("rolls back when an injected fault makes a put reject mid-transaction", async () => {
    const faults = new FaultController();
    const driver = memoryDriver({ faults });
    const db = await driver.open("trellis", 1, SPECS);
    faults.failPut("b"); // arm: next put to store "b" rejects
    await expect(
      db.tx(["a", "b"], "readwrite", async (tx) => {
        await tx.store("a").put({ id: "1", v: "x" });
        await tx.store("b").put({ id: "2", v: "y" });
      }),
    ).rejects.toThrow(/injected fault/i);
    const a = await db.tx(["a"], "readonly", async (tx) => tx.store("a").getAll());
    expect(a).toEqual([]); // store "a" rolled back too
  });

  it("persists data across close() and re-open() (reload survival)", async () => {
    const driver = memoryDriver();
    const db1 = await driver.open("trellis", 1, SPECS);
    await db1.tx(["a"], "readwrite", async (tx) => tx.store("a").put({ id: "1", v: "keep" }));
    db1.close();
    const db2 = await driver.open("trellis", 1, SPECS);
    const got = await db2.tx(["a"], "readonly", async (tx) => tx.store("a").get("1"));
    expect(got).toEqual({ id: "1", v: "keep" });
  });

  it("queries a compound index by range in ascending key order", async () => {
    const driver = memoryDriver();
    const db = await driver.open("trellis", 1, SPECS);
    await db.tx(["evt"], "readwrite", async (tx) => {
      await tx.store("evt").put({ id: "e2", stepId: "s1", ts: "2026-01-01T00:00:02Z" });
      await tx.store("evt").put({ id: "e1", stepId: "s1", ts: "2026-01-01T00:00:01Z" });
      await tx.store("evt").put({ id: "e3", stepId: "s2", ts: "2026-01-01T00:00:03Z" });
    });
    const s1 = await db.tx(["evt"], "readonly", async (tx) =>
      tx.store("evt").index("by_step_ts").getAll({ lower: ["s1"], upper: ["s1", "￿"] }),
    );
    expect((s1 as { id: string }[]).map((e) => e.id)).toEqual(["e1", "e2"]);
  });
});
