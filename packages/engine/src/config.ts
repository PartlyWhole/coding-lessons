// Engine tuning constants (§10.2). Identical across learners → deterministic.
// Injectable so content/tests can override without touching the update math.

export interface EngineConfig {
  /** §10.2 LEARN_RATE — pass nudges mastery toward 1 with diminishing returns. */
  learnRate: number;
  /** §10.2 SLIP — mastery penalty per misconception delta. */
  slip: number;
  /** §10.2 SMALL — mastery penalty for a generic fail (mismatch/syntax/runtime). */
  small: number;
  /** §4.3 COMPLETION_THRESHOLD — a node is "done" when every taught skill is at/above this. */
  completionThreshold: number;
  /** Weight applied to a `pass` delta when content authors none (non-build steps). */
  defaultPassWeight: number;
  /** Weight applied to a default fail/misconception delta when content authors none. */
  defaultFailWeight: number;
}

export const DEFAULT_CONFIG: EngineConfig = {
  learnRate: 0.5,
  slip: 0.15,
  small: 0.05,
  completionThreshold: 0.8,
  defaultPassWeight: 1,
  defaultFailWeight: 1,
};

export function clamp01(x: number): number {
  if (x < 0) return 0;
  if (x > 1) return 1;
  return x;
}
