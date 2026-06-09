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

export type { BuildSandbox, BuildSubmission } from "./buildSandbox.js";
export { compareValues, floatClose, setEqual } from "./compare.js";
export type { Comparator } from "./compare.js";
export { makePrng } from "./prng.js";
export type { Prng } from "./prng.js";
export { genValue, genArgs } from "./generators.js";
export { shrink, shrinkCandidates } from "./shrink.js";
export { runTests } from "./testRunner.js";
export type { TestRunResult } from "./testRunner.js";
export { runProperty } from "./propertyRunner.js";
export type { PropertyResult } from "./propertyRunner.js";
export { evaluate, assembleBuildSignals } from "./evaluate.js";
export type { Submission } from "./evaluate.js";
export { entrypointDriver, parseDriverStdout, SENTINEL } from "./pyDriver.js";
