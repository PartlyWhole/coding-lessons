import { describe, it, expect } from "vitest";
import type { BuildStep } from "@trellis/schema";
import { toHeadlessStep, composeSubmission } from "../../src/graphical/transform-step.js";
import { composeHeadlessSource, composeReferenceSource } from "../../src/graphical/compose.js";

const graphical = {
  entrypoints: { init: "init", update: "update", probe: "probe" },
  inputTape: [{}, { keysDown: ["K_LEFT"] }],
  dt: 1 / 60,
  frames: 120,
};

const REFERENCE = "def update(state, events, dt):\n    return state\n";

function pygameStep(): BuildStep {
  return {
    id: "step.fixture.pygame",
    kind: "build",
    language: "python",
    runtime: "pygame",
    prompt: "make the ball bounce",
    skills: ["skill.test"],
    starterCode: "def update(state, events, dt):\n    return state\n",
    evaluator: {
      run: { timeoutMs: 4000, memoryMb: 256, entrypoint: "update" },
      tests: {
        cases: [
          { input: [0, 30.0], expected: { y: 100.0, vy: 30.0 } },
          { input: [10, 30.0], expected: { y: 105.0, vy: 30.0 } },
        ],
      },
      ast: { queries: [{ tag: "no_clamp", query: { node: "While" } }] },
      property: {
        referenceImpl: REFERENCE,
        generators: [
          { param: "frame", type: "int", min: 0, max: 119 },
          { param: "vy0", type: "float", min: -80, max: 80 },
        ],
        numCases: 12,
        seed: 7,
      },
      graphical,
    },
  } as BuildStep;
}

describe("toHeadlessStep (D1, §17.4)", () => {
  it("rewrites run.entrypoint to __trellis_sim", () => {
    const out = toHeadlessStep(pygameStep());
    expect(out.evaluator.run.entrypoint).toBe("__trellis_sim");
  });

  it("property.referenceImpl becomes the composed reference (sol alias, same seed)", () => {
    const out = toHeadlessStep(pygameStep());
    expect(out.evaluator.property?.referenceImpl).toBe(
      composeReferenceSource(graphical, REFERENCE, 7),
    );
  });

  it("preserves everything else — timeouts, tests, ast queries, generators, numCases, seed", () => {
    const step = pygameStep();
    const out = toHeadlessStep(step);
    expect(out.evaluator.run.timeoutMs).toBe(4000);
    expect(out.evaluator.run.memoryMb).toBe(256);
    expect(out.evaluator.tests).toEqual(step.evaluator.tests);
    expect(out.evaluator.ast).toEqual(step.evaluator.ast);
    expect(out.evaluator.property?.generators).toEqual(step.evaluator.property?.generators);
    expect(out.evaluator.property?.numCases).toBe(12);
    expect(out.evaluator.property?.seed).toBe(7);
    expect(out.id).toBe(step.id);
    expect(out.lockedRegions).toBe(step.lockedRegions);
  });

  it("is pure — the input step is not mutated", () => {
    const step = pygameStep();
    const before = JSON.parse(JSON.stringify(step));
    toHeadlessStep(step);
    expect(step).toEqual(before);
  });

  it("a step WITHOUT graphical returns the SAME reference (identity)", () => {
    const step = pygameStep();
    delete (step.evaluator as { graphical?: unknown }).graphical;
    expect(toHeadlessStep(step)).toBe(step);
  });

  it("composeSubmission composes the learner code with the step's graphical config and seed", () => {
    const step = pygameStep();
    const code = "def update(state, events, dt):\n    return state\n";
    expect(composeSubmission(step, code)).toBe(composeHeadlessSource(graphical, code, 7));
  });

  it("composeSubmission seed defaults to 0 when the step has no property", () => {
    const step = pygameStep();
    delete (step.evaluator as { property?: unknown }).property;
    const code = "x = 1";
    expect(composeSubmission(step, code)).toBe(composeHeadlessSource(graphical, code, 0));
  });
});
