import type { BuildStep } from "@trellis/schema";
import { composeHeadlessSource, composeReferenceSource } from "./compose.js";

// D1 — rewrite a pygame step so the FROZEN Run→Test→AST→Property ladder grades the
// synthesized `__trellis_sim` entrypoint instead of the raw `update`:
//   - run.entrypoint → "__trellis_sim" (tests pass input: [frame, ...initArgs])
//   - property.referenceImpl → the composed reference (same appendix + `sol` alias,
//     so the unchanged propertyRunner samples (frame, init-args) trajectories)
// Everything else is preserved; a step without `graphical` returns IDENTICALLY (same
// reference) so the non-pygame path costs nothing. Pure: the input is never mutated.
export function toHeadlessStep(step: BuildStep): BuildStep {
  const g = step.evaluator.graphical;
  if (g === undefined) return step;
  const seed = step.evaluator.property?.seed ?? 0;
  return {
    ...step,
    evaluator: {
      ...step.evaluator,
      run: { ...step.evaluator.run, entrypoint: "__trellis_sim" },
      ...(step.evaluator.property !== undefined
        ? {
            property: {
              ...step.evaluator.property,
              referenceImpl: composeReferenceSource(
                g,
                step.evaluator.property.referenceImpl,
                seed,
              ),
            },
          }
        : {}),
    },
  };
}

// The submission-side mirror: the learner's code composed with the step's graphical
// driver (same seed as the reference — determinism is the whole point).
export function composeSubmission(step: BuildStep, code: string): string {
  const g = step.evaluator.graphical;
  if (g === undefined) return code;
  return composeHeadlessSource(g, code, step.evaluator.property?.seed ?? 0);
}
