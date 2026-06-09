import { describe, it, expect } from "vitest";
import { memoryDriver } from "../src/idb/memory.js";
import { openTrellisDb } from "../src/db.js";

describe("openTrellisDb", () => {
  it("bootstraps a learnerId via the injected idGen and persists it", async () => {
    const driver = memoryDriver();
    const ids = ["learner-fixed"];
    const idGen = () => ids.shift() ?? "unexpected";
    const db1 = await openTrellisDb(driver, { idGen });
    expect(db1.learnerId).toBe("learner-fixed");
    db1.close();
    // Reopen: learnerId is read back, not regenerated (idGen would now return "unexpected").
    const db2 = await openTrellisDb(driver, { idGen });
    expect(db2.learnerId).toBe("learner-fixed");
  });

  it("round-trips meta values", async () => {
    const driver = memoryDriver();
    const db = await openTrellisDb(driver, { idGen: () => "L" });
    await db.setMeta("contentVersion", "v1");
    expect(await db.getMeta("contentVersion")).toBe("v1");
  });
});
