import type { Bundle, Step, Diagnosis, BehavioralEvent } from "@trellis/schema";
import {
  evaluate,
  diagnoseNonBuild,
  applyDiagnosis,
  type BuildSandbox,
  type Submission,
  type DiagnoseEffects,
} from "@trellis/engine";
import {
  commitSubmission,
  loadLearnerModel,
  type TrellisDb,
  type StoredSkillState,
} from "@trellis/persist";

export interface RunnerEffects {
  newId: () => string;
  now: () => string; // ISO timestamp
  learnerId: string;
}

// Grade one submission. Build steps go through the async ladder (needs the sandbox); non-build
// steps use the sync path. Both produce a Diagnosis.
export async function gradeStep(
  step: Step,
  submission: Submission,
  sandbox: BuildSandbox,
  bundle: Bundle,
  fx: RunnerEffects,
): Promise<Diagnosis> {
  const effects: DiagnoseEffects = { id: fx.newId(), learnerId: fx.learnerId, now: fx.now() };
  if (step.kind === "build") {
    return evaluate(step, submission, sandbox, bundle, effects);
  }
  if (submission.kind === "build") throw new Error("build submission on a non-build step");
  return diagnoseNonBuild(step, submission, bundle, effects);
}

// §10.2 + §3.10 — apply the diagnosis to the persisted learner model and commit it together
// with the diagnosis and any behavioral events in ONE atomic transaction. Only the skills the
// diagnosis touched are written back.
export async function persistDiagnosis(
  db: TrellisDb,
  bundle: Bundle,
  diagnosis: Diagnosis,
  events: BehavioralEvent[],
): Promise<void> {
  const model = await loadLearnerModel(db, bundle.contentVersion);
  const updated = applyDiagnosis(model, diagnosis);
  const touched = new Set(diagnosis.skillDeltas.map((d) => d.skill));
  const skillUpdates: StoredSkillState[] = [...touched]
    .map((skillId) => {
      const s = updated.skills[skillId];
      return s ? { skillId, ...s } : null;
    })
    .filter((x): x is StoredSkillState => x !== null);
  await commitSubmission(db, { skillUpdates, diagnosis, events });
}
