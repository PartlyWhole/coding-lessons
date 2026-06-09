import { describe, it, expect } from "vitest";
import type { BuildStep, Bundle, RunRequest, RunResult, AstQuery } from "@trellis/schema";
import { evaluate } from "../src/evaluate.js";
import { SENTINEL } from "../src/pyDriver.js";

const fx = { id: "d1", learnerId: "L1", now: "2026-06-08T00:00:00.000Z" };

const bundle = {
  contentVersion: "test@1",
  skills: { "skill.x": { id: "skill.x", title: "x", description: "", misconceptions: ["mis.rt"], upstream: [] } },
  misconceptions: {
    "mis.rt": {
      id: "mis.rt", skill: "skill.x", title: "runtime fault",
      signature: { runError: "runtime" }, hintLadder: [], feedback: "",
      skillDeltas: [{ skill: "skill.x", kind: "misconception", weight: 0.4 }],
    },
  },
  nodes: {}, cells: {}, producers: {}, requirements: {},
} as unknown as Bundle;

const step = {
  id: "cell.x#1", kind: "build", skills: ["skill.x"], language: "python", starterCode: "",
  evaluator: {
    run: { timeoutMs: 2000, memoryMb: 256, entrypoint: "f" },
    tests: { comparator: "deep-equal", cases: [{ input: 1, expected: 2 }] },
    ast: { queries: [{ tag: "t", query: { node: "Return" } as AstQuery }] },
  },
} as unknown as BuildStep;

const ok = (over: Partial<RunResult>): RunResult => ({ ran: true, stdout: "", wallMs: 1, timedOut: false, ...over });

function sandbox(opts: { run: (r: RunRequest) => RunResult; tags?: string[] }) {
  return {
    run: async (r: RunRequest) => opts.run(r),
    parseAndMatch: async () => opts.tags ?? [],
  };
}

describe("evaluate - build path (§8)", () => {
  it("syntax error short-circuits to attribution=syntax, correct=false", async () => {
    const sb = sandbox({ run: () => ok({ ran: false, error: { type: "syntax", message: "bad" } }), tags: [] });
    const d = await evaluate(step, { kind: "build", code: "def f(" }, sb, bundle, fx);
    expect(d.correct).toBe(false);
    expect(d.attribution).toBe("syntax");
    expect(d.signals.ran).toBe(false);
  });

  it("a passing solution -> correct, attribution=pass", async () => {
    const sb = sandbox({
      run: (r) => (r.code.includes("_t_res")
        ? ok({ stdout: SENTINEL + JSON.stringify({ v: 2 }) })  // entrypoint driver case
        : ok({})),                                              // bare run
      tags: ["t"],
    });
    const d = await evaluate(step, { kind: "build", code: "def f(x):\n    return 2" }, sb, bundle, fx);
    expect(d.correct).toBe(true);
    expect(d.attribution).toBe("pass");
  });

  it("a per-case runtime error -> detect fires mis.rt (misconception)", async () => {
    const sb = sandbox({
      run: (r) => {
        const isDriver = r.code.includes("_t_res");
        return isDriver ? ok({ ran: true, error: { type: "runtime", message: "NameError" } }) : ok({});
      },
      tags: [],
    });
    const d = await evaluate(step, { kind: "build", code: "def f(x):\n    return missing" }, sb, bundle, fx);
    expect(d.correct).toBe(false);
    expect(d.attribution).toBe("misconception");
    expect(d.misconceptionId).toBe("mis.rt");
  });

  it("is deterministic: identical Diagnosis for identical inputs", async () => {
    const mk = () => sandbox({ run: () => ok({ stdout: SENTINEL + JSON.stringify({ v: 2 }) }), tags: ["t"] });
    const a = await evaluate(step, { kind: "build", code: "def f(x):\n    return 2" }, mk(), bundle, fx);
    const b = await evaluate(step, { kind: "build", code: "def f(x):\n    return 2" }, mk(), bundle, fx);
    expect(a).toEqual(b);
  });
});
