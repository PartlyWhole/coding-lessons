// NOTE: @trellis/schema exports SkillId/StepId/ContentVersion as TypeBox VALUES (Type.String()),
// not TS types — so we use `string` (their exact Static<> resolution) for those positions.
import type { LearnerModel, SkillState, Diagnosis } from "@trellis/schema";
import type { TrellisDb } from "./db.js";
import { STORES } from "./schema.js";
import type { StoredSkillState } from "./schema.js";

/** Read all learner_skill rows into a LearnerModel for `contentVersion` (§3.8/§4.3 gating input). */
export async function loadLearnerModel(db: TrellisDb, contentVersion: string): Promise<LearnerModel> {
  const rows = (await db.conn.tx([STORES.learnerSkill], "readonly", async (tx) =>
    tx.store(STORES.learnerSkill).getAll(),
  )) as StoredSkillState[];

  const skills: Record<string, SkillState> = {};
  for (const row of rows) {
    const { skillId, ...state } = row;
    skills[skillId] = state;
  }
  return { learnerId: db.learnerId, skills, contentVersion };
}

/** Diagnosis history, ascending by submittedAt (the by_submittedAt index, §3.10). */
export async function readDiagnoses(db: TrellisDb): Promise<Diagnosis[]> {
  const rows = (await db.conn.tx([STORES.diagnosis], "readonly", async (tx) =>
    tx.store(STORES.diagnosis).index("by_submittedAt").getAll(),
  )) as Diagnosis[];
  return rows;
}
