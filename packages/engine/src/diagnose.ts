import type {
  Step,
  AcceptedAnswer,
  RawSignals,
  Diagnosis,
  SkillDelta,
  Bundle,
  Attribution,
} from "@trellis/schema";
import { RE2JS } from "re2js";
import { normalize } from "./normalize.js";
import { detect, type DetectContext } from "./detect.js";
import { DEFAULT_CONFIG, type EngineConfig } from "./config.js";

// The learner's raw input for a non-build step (not carried in RawSignals — see plan
// design fact #3). The discriminator must match the step kind at the call site.
export type NonBuildSubmission =
  | { kind: "recognize"; choiceId: string }
  | { kind: "recall"; text: string }
  | { kind: "predict"; choiceId?: string; text?: string };

// Injected effects keep the engine pure (no clock / no uuid).
export interface DiagnoseEffects {
  id: string;
  learnerId: string;
  now: string; // ISO timestamp, provided by the caller
}

// §8 non-build comparison: normalized exact OR anchored RE2 full-match (design fact #7).
export function matchesAccepted(accepted: AcceptedAnswer, value: string): boolean {
  const norm = normalize(value);
  if (accepted.normalized && accepted.normalized.some((a) => normalize(a) === norm)) {
    return true;
  }
  if (accepted.patterns) {
    for (const p of accepted.patterns) {
      if (RE2JS.compile(p).matches(value)) return true; // anchored full match
    }
  }
  return false;
}

export function compareNonBuild(step: Step, sub: NonBuildSubmission): boolean {
  switch (step.kind) {
    case "recognize":
      if (sub.kind !== "recognize") throw new Error("submission kind != step kind (recognize)");
      return sub.choiceId === step.correctChoiceId;
    case "recall":
      if (sub.kind !== "recall") throw new Error("submission kind != step kind (recall)");
      return matchesAccepted(step.accepted, sub.text);
    case "predict": {
      if (sub.kind !== "predict") throw new Error("submission kind != step kind (predict)");
      const value = step.choices ? (sub.choiceId ?? "") : (sub.text ?? "");
      return matchesAccepted(step.expected, value);
    }
    default:
      throw new Error(`compareNonBuild called on a ${step.kind} step`);
  }
}

// Direct authored mapping (most local): a chosen Choice.misconception, or an
// AcceptedAnswer.misconceptionMap entry. Takes precedence over signature detect().
function directMisconception(step: Step, sub: NonBuildSubmission): string | undefined {
  if (step.kind === "recognize" && sub.kind === "recognize") {
    return step.choices.find((c) => c.id === sub.choiceId)?.misconception;
  }
  if (step.kind === "recall" && sub.kind === "recall") {
    return step.accepted.misconceptionMap?.[normalize(sub.text)];
  }
  if (step.kind === "predict" && sub.kind === "predict") {
    const map = step.expected.misconceptionMap;
    if (step.choices) {
      const key = sub.choiceId ?? "";
      return map?.[key] ?? step.choices.find((c) => c.id === sub.choiceId)?.misconception;
    }
    return map?.[normalize(sub.text ?? "")];
  }
  return undefined;
}

function detectContext(sub: NonBuildSubmission): DetectContext {
  const signals: RawSignals = { ran: false, wallMs: 0 };
  const ctx: DetectContext = { signals };
  if (sub.kind === "recognize") ctx.choiceId = sub.choiceId;
  else if (sub.kind === "recall") ctx.recallText = sub.text;
  else {
    if (sub.choiceId !== undefined) ctx.choiceId = sub.choiceId;
    if (sub.text !== undefined) ctx.recallText = sub.text;
  }
  return ctx;
}

// §8 computeDeltas — outcome → SkillDelta[]. Pass: positive weight on each step skill.
// Misconception: the authored deltas (or a default negative on the misconception's skill).
// Generic fail (mismatch/syntax/runtime): a small negative on each step skill.
export function computeDeltas(
  step: Step,
  correct: boolean,
  mid: string | undefined,
  bundle: Bundle,
  cfg: EngineConfig,
): SkillDelta[] {
  if (correct) {
    return step.skills.map((sk) => ({ skill: sk, kind: "pass", weight: cfg.defaultPassWeight }));
  }
  if (mid !== undefined) {
    const m = bundle.misconceptions[mid];
    if (m?.skillDeltas && m.skillDeltas.length > 0) return m.skillDeltas;
    if (m) return [{ skill: m.skill, kind: "misconception", weight: cfg.defaultFailWeight }];
    // mid references a misconception absent from the bundle (a dangling ref in malformed
    // content — referential integrity is M1's compiler gate). Never silently no-op: fall
    // back to a generic fail delta per step skill so mastery still reflects the wrong answer.
    return step.skills.map((sk) => ({ skill: sk, kind: "fail", weight: cfg.defaultFailWeight }));
  }
  return step.skills.map((sk) => ({ skill: sk, kind: "fail", weight: cfg.defaultFailWeight }));
}

// §8 diagnose (non-build path). Total + deterministic: same (step, submission, fx) →
// same Diagnosis. `signals` is minimal; the submission is captured by attribution.
export function diagnoseNonBuild(
  step: Step,
  sub: NonBuildSubmission,
  bundle: Bundle,
  fx: DiagnoseEffects,
  cfg: EngineConfig = DEFAULT_CONFIG,
): Diagnosis {
  if (step.kind === "build" || step.kind === "watch") {
    throw new Error(`diagnoseNonBuild does not handle a ${step.kind} step`);
  }
  const correct = compareNonBuild(step, sub);
  let mid: string | undefined;
  let attribution: Attribution;
  if (correct) {
    attribution = "pass";
  } else {
    mid = directMisconception(step, sub) ?? detect(step, detectContext(sub), bundle) ?? undefined;
    attribution = mid !== undefined ? "misconception" : "mismatch";
  }
  const skillDeltas = computeDeltas(step, correct, mid, bundle, cfg);
  const diag: Diagnosis = {
    id: fx.id,
    learnerId: fx.learnerId,
    stepId: step.id,
    contentVersion: bundle.contentVersion,
    submittedAt: fx.now,
    correct,
    attribution,
    signals: { ran: false, wallMs: 0 },
    skillDeltas,
    seed: 0, // non-build steps have no evaluator.property.seed
  };
  if (mid !== undefined) diag.misconceptionId = mid;
  return diag;
}
