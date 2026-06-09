import { describe, it, expect } from "vitest";
import { memoryDriver } from "../src/idb/memory.js";
import { openTrellisDb } from "../src/db.js";
import { commitSubmission } from "../src/commitSubmission.js";
import { loadLearnerModel, readDiagnoses } from "../src/learnerModel.js";
import type { StoredSkillState } from "../src/schema.js";
import type { Diagnosis, BehavioralEvent } from "@trellis/schema";

describe("reload survival (close + reopen the DB)", () => {
  it("mastery + diagnosis history round-trip identically across a simulated reload", async () => {
    const driver = memoryDriver(); // one factory instance = the persistent origin store
    const skillUpdates: StoredSkillState[] = [
      { skillId: "skill.a", mastery: 0.72, attempts: 4, passes: 3, lastSeen: "t9", misconceptionCounts: { "mis.concat.str_num": 1 } },
    ];
    const diagnosis: Diagnosis = {
      id: "d1", learnerId: "L", stepId: "s1", contentVersion: "v1", submittedAt: "t9",
      correct: false, attribution: "misconception", misconceptionId: "mis.concat.str_num",
      signals: { ran: true, wallMs: 3 }, skillDeltas: [], seed: 7,
    };
    const events: BehavioralEvent[] = [
      { id: "e1", learnerId: "L", sessionId: "s", seq: 0, stepId: "s1", ts: "t9", type: "submission", payload: {} },
    ];

    const db1 = await openTrellisDb(driver, { idGen: () => "L" });
    await commitSubmission(db1, { skillUpdates, diagnosis, events });
    const modelBefore = await loadLearnerModel(db1, "v1");
    const historyBefore = await readDiagnoses(db1);
    db1.close();

    const db2 = await openTrellisDb(driver, { idGen: () => "SHOULD-NOT-BE-USED" });
    const modelAfter = await loadLearnerModel(db2, "v1");
    const historyAfter = await readDiagnoses(db2);

    expect(db2.learnerId).toBe("L");           // learnerId survived
    expect(modelAfter).toEqual(modelBefore);    // mastery survived, identical
    expect(historyAfter).toEqual(historyBefore); // diagnosis history survived, identical
  });
});
