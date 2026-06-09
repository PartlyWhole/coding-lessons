import { describe, it, expect } from "vitest";
import { memoryDriver, FaultController } from "../src/idb/memory.js";
import { openTrellisDb } from "../src/db.js";
import { commitSubmission } from "../src/commitSubmission.js";
import { STORES } from "../src/schema.js";
import type { StoredSkillState } from "../src/schema.js";
import type { Diagnosis, BehavioralEvent } from "@trellis/schema";

function fixture() {
  const skillUpdates: StoredSkillState[] = [
    { skillId: "skill.output.print_literal", mastery: 0.6, attempts: 1, passes: 1, lastSeen: "2026-06-08T00:00:00Z", misconceptionCounts: {} },
  ];
  const diagnosis: Diagnosis = {
    id: "diag-1", learnerId: "L", stepId: "step-1", contentVersion: "v1",
    submittedAt: "2026-06-08T00:00:00Z", correct: true, attribution: "pass",
    signals: { ran: true, wallMs: 5 }, skillDeltas: [], seed: 0,
  };
  const events: BehavioralEvent[] = [
    { id: "evt-1", learnerId: "L", sessionId: "sess-1", seq: 0, stepId: "step-1", ts: "2026-06-08T00:00:00Z", type: "submission", payload: {} },
  ];
  return { skillUpdates, diagnosis, events };
}

describe("commitSubmission", () => {
  it("writes skill + diagnosis + events in one transaction", async () => {
    const db = await openTrellisDb(memoryDriver(), { idGen: () => "L" });
    const { skillUpdates, diagnosis, events } = fixture();
    await commitSubmission(db, { skillUpdates, diagnosis, events });

    const [skills, diags, evts] = await db.conn.tx(
      [STORES.learnerSkill, STORES.diagnosis, STORES.behavioralEvent],
      "readonly",
      async (tx) => [
        await tx.store(STORES.learnerSkill).getAll(),
        await tx.store(STORES.diagnosis).getAll(),
        await tx.store(STORES.behavioralEvent).getAll(),
      ],
    );
    expect(skills).toHaveLength(1);
    expect(diags).toHaveLength(1);
    expect(evts).toHaveLength(1);
  });

  it("rolls back ALL THREE stores when a write fails mid-transaction (atomicity gate)", async () => {
    const faults = new FaultController();
    const db = await openTrellisDb(memoryDriver({ faults }), { idGen: () => "L" });
    const { skillUpdates, diagnosis, events } = fixture();
    faults.failPut(STORES.diagnosis); // force the diagnosis write to error inside the txn

    await expect(commitSubmission(db, { skillUpdates, diagnosis, events })).rejects.toThrow(/injected fault/i);

    const [skills, diags, evts] = await db.conn.tx(
      [STORES.learnerSkill, STORES.diagnosis, STORES.behavioralEvent],
      "readonly",
      async (tx) => [
        await tx.store(STORES.learnerSkill).getAll(),
        await tx.store(STORES.diagnosis).getAll(),
        await tx.store(STORES.behavioralEvent).getAll(),
      ],
    );
    expect(skills).toEqual([]); // no partial write — skill rolled back too
    expect(diags).toEqual([]);
    expect(evts).toEqual([]);
  });
});
