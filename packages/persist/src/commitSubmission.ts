import type { Diagnosis, BehavioralEvent } from "@trellis/schema";
import type { TrellisDb } from "./db.js";
import { STORES } from "./schema.js";
import type { StoredSkillState } from "./schema.js";

export interface SubmissionWrite {
  /** Engine-computed new SkillState records (§10.2 outputs — persist does not compute mastery). */
  skillUpdates: StoredSkillState[];
  diagnosis: Diagnosis;
  events: BehavioralEvent[];
}

/**
 * Persist one submission's outcome in a SINGLE readwrite transaction spanning learner_skill +
 * diagnosis + behavioral_event (§3.10). All-or-nothing: any write error aborts the whole txn and
 * nothing is persisted. Write-only — no read-modify-write — so the (native) txn never spans a
 * foreign await and cannot auto-commit early.
 */
export async function commitSubmission(db: TrellisDb, write: SubmissionWrite): Promise<void> {
  await db.conn.tx(
    [STORES.learnerSkill, STORES.diagnosis, STORES.behavioralEvent],
    "readwrite",
    async (tx) => {
      for (const s of write.skillUpdates) await tx.store(STORES.learnerSkill).put(s);
      await tx.store(STORES.diagnosis).put(write.diagnosis);
      for (const e of write.events) await tx.store(STORES.behavioralEvent).put(e);
    },
  );
}
