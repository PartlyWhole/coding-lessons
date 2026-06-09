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

  it("tests pass but property fails with no matching misconception -> mismatch", async () => {
    // tests pass (f(1)===2), but the property oracle (sol(x)=x+1) diverges from the
    // learner (constant 2) for x!==1, so the property arm fails. No corpus signature here
    // keys on propertyFailed, so detect() returns null -> attribution "mismatch".
    const propStep = {
      id: "cell.x#1", kind: "build", skills: ["skill.x"], language: "python", starterCode: "",
      evaluator: {
        run: { timeoutMs: 2000, memoryMb: 256, entrypoint: "f" },
        tests: { comparator: "deep-equal", cases: [{ input: 1, expected: 2 }] },
        property: {
          referenceImpl: "def sol(x):\n    return x + 1",
          generators: [{ param: "x", type: "int", min: 0, max: 5 }],
          numCases: 5, seed: 7, comparator: "deep-equal",
        },
      },
    } as unknown as BuildStep;
    const sb = {
      parseAndMatch: async (): Promise<string[]> => [],
      run: async (r: RunRequest): Promise<RunResult> => {
        if (!r.code.includes("_t_res")) return ok({}); // bare run
        const m = r.code.match(/b64decode\("([^"]+)"\)/);
        const args = m ? (JSON.parse(atob(m[1]!)) as number[]) : [];
        const x = args[0] ?? 0;
        const v = r.code.includes("def sol") ? x + 1 : 2; // oracle: x+1, learner: constant 2
        return ok({ stdout: SENTINEL + JSON.stringify({ v }) });
      },
    };
    const d = await evaluate(propStep, { kind: "build", code: "def f(x):\n    return 2" }, sb, bundle, fx);
    expect(d.correct).toBe(false);
    expect(d.attribution).toBe("mismatch");
    expect(d.signals.property?.passed).toBe(false);
    expect(d.misconceptionId).toBeUndefined();
  });

  it("is deterministic: identical Diagnosis for identical inputs", async () => {
    const mk = () => sandbox({ run: () => ok({ stdout: SENTINEL + JSON.stringify({ v: 2 }) }), tags: ["t"] });
    const a = await evaluate(step, { kind: "build", code: "def f(x):\n    return 2" }, mk(), bundle, fx);
    const b = await evaluate(step, { kind: "build", code: "def f(x):\n    return 2" }, mk(), bundle, fx);
    expect(a).toEqual(b);
  });
});

// ── §7/§8 routing of !ran submissions through detect() (verification escalation 1) ──
// Mirrors the three debt3 checks (verification/debt3.js) at the evaluate() level: a
// watchdog-killed run must be attributable to a misconception through the LIVE ladder,
// not only via a direct detect() call.

// The post-re-key loop signatures, as on main (see detect-precedence.test.ts / content).
const loopBundle = {
  contentVersion: "test@1",
  skills: {
    "skill.loop": {
      id: "skill.loop", title: "loop", description: "",
      misconceptions: ["mis.loop.infinite_true", "mis.loop.no_update"], upstream: [],
    },
  },
  misconceptions: {
    "mis.loop.infinite_true": {
      id: "mis.loop.infinite_true", skill: "skill.loop", title: "infinite while True",
      signature: { any: [{ timedOut: true }, { astTag: "infinite_true_no_break" }, { choice: "b" }] },
      hintLadder: [], feedback: "",
      skillDeltas: [{ skill: "skill.loop", kind: "misconception", weight: 0.4 }],
    },
    "mis.loop.no_update": {
      id: "mis.loop.no_update", skill: "skill.loop", title: "never-updating while cond",
      signature: { any: [{ astTag: "while_cond_no_update" }, { choice: "b" }] },
      hintLadder: [], feedback: "",
      skillDeltas: [{ skill: "skill.loop", kind: "misconception", weight: 0.4 }],
    },
  },
  nodes: {}, cells: {}, producers: {}, requirements: {},
} as unknown as Bundle;

const loopStep = {
  id: "cell.loop#1", kind: "build", skills: ["skill.loop"], language: "python", starterCode: "",
  evaluator: {
    run: { timeoutMs: 2000, memoryMb: 256 },
    ast: {
      queries: [
        { tag: "infinite_true_no_break", query: { node: "While" } as AstQuery },
        { tag: "while_cond_no_update", query: { node: "While" } as AstQuery },
      ],
    },
  },
} as unknown as BuildStep;

const timeoutSandbox = (tags: string[]) =>
  sandbox({ run: () => ok({ ran: false, timedOut: true, wallMs: 2001 }), tags });

describe("evaluate — !ran/timedOut routes through detect() (escalation 1)", () => {
  it("a bare watchdog timeout with no astTags → mis.loop.infinite_true (timedOut branch)", async () => {
    const d = await evaluate(loopStep, { kind: "build", code: "while True:\n    pass" }, timeoutSandbox([]), loopBundle, fx);
    expect(d.correct).toBe(false);
    expect(d.signals.ran).toBe(false);
    expect(d.signals.timedOut).toBe(true);
    expect(d.attribution).toBe("misconception");
    expect(d.misconceptionId).toBe("mis.loop.infinite_true");
  });

  it("a never-updating `while cond:` timeout → mis.loop.no_update wins §7 precedence", async () => {
    const sb = timeoutSandbox(["while_cond_no_update"]);
    const d = await evaluate(loopStep, { kind: "build", code: "while g != n:\n    print(1)" }, sb, loopBundle, fx);
    expect(d.attribution).toBe("misconception");
    expect(d.misconceptionId).toBe("mis.loop.no_update");
  });

  it("a true `while True:` no-break timeout (both tags) → mis.loop.infinite_true", async () => {
    const sb = timeoutSandbox(["infinite_true_no_break", "while_cond_no_update"]);
    const d = await evaluate(loopStep, { kind: "build", code: "while True:\n    print(1)" }, sb, loopBundle, fx);
    expect(d.attribution).toBe("misconception");
    expect(d.misconceptionId).toBe("mis.loop.infinite_true");
  });

  it("a module-level runtime error with NO matching signature still → attribution 'runtime'", async () => {
    const sb = sandbox({ run: () => ok({ ran: false, error: { type: "runtime", message: "ZeroDivisionError" } }), tags: [] });
    const d = await evaluate(loopStep, { kind: "build", code: "1/0" }, sb, loopBundle, fx);
    expect(d.correct).toBe(false);
    expect(d.attribution).toBe("runtime");
    expect(d.misconceptionId).toBeUndefined();
  });

  it("a syntax error with NO matching signature still → attribution 'syntax'", async () => {
    const sb = sandbox({ run: () => ok({ ran: false, error: { type: "syntax", message: "bad" } }), tags: [] });
    const d = await evaluate(loopStep, { kind: "build", code: "while True\n    pass" }, sb, loopBundle, fx);
    expect(d.attribution).toBe("syntax");
    expect(d.misconceptionId).toBeUndefined();
  });

  it("a module-level runtime error WITH a runError-keyed signature → misconception", async () => {
    // The mis.rt bundle keys on { runError: "runtime" }; a module-level fault must now
    // reach detect() and attribute it (a signature may key on runError — START-HERE §3a).
    const sb = sandbox({ run: () => ok({ ran: false, error: { type: "runtime", message: "NameError" } }), tags: [] });
    const d = await evaluate(step, { kind: "build", code: "missing" }, sb, bundle, fx);
    expect(d.correct).toBe(false);
    expect(d.attribution).toBe("misconception");
    expect(d.misconceptionId).toBe("mis.rt");
  });
});
