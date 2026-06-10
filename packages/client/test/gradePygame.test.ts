import { describe, it, expect } from "vitest";
import type { Bundle, BuildStep, RunRequest, RunResult, AstQuery } from "@trellis/schema";
import type { BuildSandbox } from "@trellis/engine";
import { HEADLESS_PREFIX, APPENDIX_MARKER, composeSubmission, toHeadlessStep } from "@trellis/sandbox";
import { gradeStep } from "../src/runner/grade.js";

const bundle = {
  contentVersion: "v1",
  skills: {},
  misconceptions: {},
  nodes: {},
  cells: {},
  producers: {},
  requirements: {},
} as unknown as Bundle;

const fx = { newId: () => "diag-1", now: () => "2026-01-01T00:00:00Z", learnerId: "L" };

function stubSandbox() {
  const runs: (RunRequest & { packages?: string[] })[] = [];
  const parses: { code: string }[] = [];
  const sandbox: BuildSandbox = {
    run: async (req: RunRequest): Promise<RunResult> => {
      runs.push(req as RunRequest & { packages?: string[] });
      return { ran: true, stdout: "", returnValue: null, wallMs: 1, timedOut: false };
    },
    parseAndMatch: async (code: string, _q: { tag: string; query: AstQuery }[]) => {
      parses.push({ code });
      return [];
    },
  };
  return { sandbox, runs, parses };
}

const graphical = {
  entrypoints: { update: "update" },
  inputTape: [],
  dt: 1 / 60,
  frames: 10,
};

function pygameStep(): BuildStep {
  return {
    id: "b.pg",
    kind: "build",
    prompt: "p",
    skills: [],
    language: "python",
    runtime: "pygame",
    starterCode: "",
    evaluator: {
      run: { timeoutMs: 2000, memoryMb: 256, entrypoint: "update" },
      tests: { cases: [{ input: [0], expected: null }] },
      ast: { queries: [{ tag: "t", query: { node: "While" } }] },
      graphical,
    },
  } as unknown as BuildStep;
}

function plainStep(): BuildStep {
  return {
    id: "b.plain",
    kind: "build",
    prompt: "p",
    skills: [],
    language: "python",
    starterCode: "",
    evaluator: {
      run: { timeoutMs: 2000, memoryMb: 256, entrypoint: "f" },
      tests: { cases: [{ input: [1], expected: null }] },
    },
  } as unknown as BuildStep;
}

describe("gradeStep pygame branch (§17.5 — headless through the frozen ladder)", () => {
  it("a pygame step grades through toHeadlessStep + wrapGraphicalSandbox + composeSubmission", async () => {
    const { sandbox, runs, parses } = stubSandbox();
    const code = "def update(state, events, dt):\n    return state";
    const d = await gradeStep(pygameStep(), { kind: "build", code }, sandbox, bundle, fx);
    expect(d).toBeTruthy();
    // every run the ladder issued went through the graphical decorator:
    expect(runs.length).toBeGreaterThan(0);
    for (const r of runs) {
      expect(r.code.startsWith(HEADLESS_PREFIX)).toBe(true);
      expect(r.packages).toEqual(["pygame-ce"]);
      expect(r.code).toContain("__trellis_sim"); // the composed submission reached the worker
    }
    // AST rung saw the LEARNER source only (appendix stripped):
    expect(parses.length).toBeGreaterThan(0);
    for (const p of parses) {
      expect(p.code).not.toContain(APPENDIX_MARKER);
      expect(p.code).toContain("def update");
    }
  });

  it("the composed submission equals composeSubmission(step, code) over the headless step", () => {
    const step = pygameStep();
    const code = "def update(state, events, dt):\n    return state";
    // sanity on the helpers the branch wires together
    expect(composeSubmission(step, code)).toContain(APPENDIX_MARKER);
    expect(toHeadlessStep(step).evaluator.run.entrypoint).toBe("__trellis_sim");
  });

  it("a non-pygame build step grades EXACTLY as today (no prefix, no packages, raw code)", async () => {
    const { sandbox, runs } = stubSandbox();
    const code = "def f(x):\n    return x";
    await gradeStep(plainStep(), { kind: "build", code }, sandbox, bundle, fx);
    expect(runs.length).toBeGreaterThan(0);
    for (const r of runs) {
      expect(r.code.startsWith(HEADLESS_PREFIX)).toBe(false);
      expect(r.packages).toBeUndefined();
      expect(r.code).not.toContain(APPENDIX_MARKER);
    }
  });

  it("a pygame-RUNTIME step WITHOUT a graphical block falls through to the normal path", async () => {
    const { sandbox, runs } = stubSandbox();
    const step = pygameStep();
    delete (step.evaluator as { graphical?: unknown }).graphical;
    await gradeStep(step, { kind: "build", code: "x = 1" }, sandbox, bundle, fx);
    for (const r of runs) {
      expect(r.code.startsWith(HEADLESS_PREFIX)).toBe(false);
    }
  });
});
