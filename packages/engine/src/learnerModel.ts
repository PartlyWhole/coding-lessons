import type { LearnerModel, Diagnosis, SkillState, Bundle } from "@trellis/schema";
import { clamp01, DEFAULT_CONFIG, type EngineConfig } from "./config.js";

export function newSkillState(now: string): SkillState {
  return { mastery: 0, attempts: 0, passes: 0, lastSeen: now, misconceptionCounts: {} };
}

// §10.2 — apply a Diagnosis's skillDeltas to the model. PURE: returns a new model,
// never mutates the input (deep-copies touched skill states + their count maps).
export function applyDiagnosis(
  model: LearnerModel,
  diag: Diagnosis,
  cfg: EngineConfig = DEFAULT_CONFIG,
): LearnerModel {
  const skills: LearnerModel["skills"] = {};
  for (const k of Object.keys(model.skills)) {
    const prev = model.skills[k]!;
    skills[k] = { ...prev, misconceptionCounts: { ...prev.misconceptionCounts } };
  }

  for (const d of diag.skillDeltas) {
    const base = skills[d.skill] ?? newSkillState(diag.submittedAt);
    const s: SkillState = { ...base, misconceptionCounts: { ...base.misconceptionCounts } };
    s.attempts += 1;
    if (d.kind === "pass") {
      s.passes += 1;
      s.mastery = clamp01(s.mastery + cfg.learnRate * (1 - s.mastery) * d.weight);
    } else if (d.kind === "misconception") {
      s.mastery = clamp01(s.mastery - cfg.slip * d.weight);
      if (diag.misconceptionId !== undefined) {
        s.misconceptionCounts[diag.misconceptionId] =
          (s.misconceptionCounts[diag.misconceptionId] ?? 0) + 1;
      }
    } else {
      s.mastery = clamp01(s.mastery - cfg.small * d.weight);
    }
    s.lastSeen = diag.submittedAt;
    skills[d.skill] = s;
  }

  return { ...model, skills };
}

// §10.3 target — when a skill fails, re-aim at the weakest upstream skill below the
// completion threshold. Deterministic walk: lowest mastery wins, ties broken by id.
export function targetUpstream(
  model: LearnerModel,
  skillId: string,
  bundle: Bundle,
  cfg: EngineConfig = DEFAULT_CONFIG,
): string | null {
  const skill = bundle.skills[skillId];
  if (!skill) return null;
  let best: { id: string; mastery: number } | null = null;
  for (const up of skill.upstream) {
    const mastery = model.skills[up]?.mastery ?? 0;
    if (mastery >= cfg.completionThreshold) continue;
    if (
      best === null ||
      mastery < best.mastery ||
      (mastery === best.mastery && up < best.id)
    ) {
      best = { id: up, mastery };
    }
  }
  return best === null ? null : best.id;
}
