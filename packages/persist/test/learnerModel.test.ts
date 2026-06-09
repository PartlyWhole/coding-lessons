import { describe, it, expect } from "vitest";
import { memoryDriver } from "../src/idb/memory.js";
import { openTrellisDb } from "../src/db.js";
import { commitSubmission } from "../src/commitSubmission.js";
import { loadLearnerModel, readDiagnoses } from "../src/learnerModel.js";
import type { StoredSkillState } from "../src/schema.js";
import type { Diagnosis } from "@trellis/schema";

describe("loadLearnerModel", () => {
  it("reconstructs LearnerModel from learner_skill rows, keyed by skillId without the skillId field", async () => {
    const db = await openTrellisDb(memoryDriver(), { idGen: () => "L" });
    const skillUpdates: StoredSkillState[] = [
      { skillId: "skill.a", mastery: 0.5, attempts: 2, passes: 1, lastSeen: "t1", misconceptionCounts: {} },
      { skillId: "skill.b", mastery: 0.9, attempts: 3, passes: 3, lastSeen: "t2", misconceptionCounts: {} },
    ];
    const diagnosis: Diagnosis = {
      id: "d1", learnerId: "L", stepId: "s1", contentVersion: "v1", submittedAt: "t1",
      correct: true, attribution: "pass", signals: { ran: true, wallMs: 1 }, skillDeltas: [], seed: 0,
    };
    await commitSubmission(db, { skillUpdates, diagnosis, events: [] });

    const model = await loadLearnerModel(db, "v1");
    expect(model.learnerId).toBe("L");
    expect(model.contentVersion).toBe("v1");
    expect(model.skills["skill.a"]).toEqual({ mastery: 0.5, attempts: 2, passes: 1, lastSeen: "t1", misconceptionCounts: {} });
    expect(model.skills["skill.b"]?.mastery).toBe(0.9);
    expect((model.skills["skill.a"] as Record<string, unknown>)["skillId"]).toBeUndefined();
  });

  it("reads diagnosis history ordered by submittedAt", async () => {
    const db = await openTrellisDb(memoryDriver(), { idGen: () => "L" });
    const mk = (id: string, at: string): Diagnosis => ({
      id, learnerId: "L", stepId: "s1", contentVersion: "v1", submittedAt: at,
      correct: true, attribution: "pass", signals: { ran: true, wallMs: 1 }, skillDeltas: [], seed: 0,
    });
    await commitSubmission(db, { skillUpdates: [], diagnosis: mk("d2", "2026-06-08T00:00:02Z"), events: [] });
    await commitSubmission(db, { skillUpdates: [], diagnosis: mk("d1", "2026-06-08T00:00:01Z"), events: [] });
    const history = await readDiagnoses(db);
    expect(history.map((d) => d.id)).toEqual(["d1", "d2"]);
  });
});
