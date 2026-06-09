// @trellis/engine — pure, deterministic core (M2). Consumes @trellis/schema as types only.
export type { EngineConfig } from "./config.js";
export { DEFAULT_CONFIG, clamp01 } from "./config.js";

export { normalize } from "./normalize.js";
export { deepEqual } from "./deepEqual.js";

export type { Availability, AvailabilityMap, UnmetRequirement } from "./resolver.js";
export { meets, completed, resolveAvailability, whyLocked } from "./resolver.js";

export type { AvailabilityDiff } from "./navigation.js";
export { spineOrder, nextSpineCell, availabilityDiff } from "./navigation.js";

export type { Phase, MachineState, StepEvent } from "./stepMachine.js";
export { initialState, step, StepTransitionError } from "./stepMachine.js";

export type { DetectContext } from "./detect.js";
export { evalSignature, specificityRank, detect } from "./detect.js";

export type { NonBuildSubmission, DiagnoseEffects } from "./diagnose.js";
export {
  matchesAccepted,
  compareNonBuild,
  computeDeltas,
  diagnoseNonBuild,
} from "./diagnose.js";

export { newSkillState, applyDiagnosis, targetUpstream } from "./learnerModel.js";
