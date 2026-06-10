import { describe, it, expect } from "vitest";
import { resolve } from "node:path";
import { loadContent } from "../src/load.js";
import { signalsFor, buildSignals, planBuildSignals, finishBuildSignals } from "../src/signals.js";
import { runCases } from "../src/ast/python.js";

const CONTENT = resolve(__dirname, "../../../content");

describe("signalsFor", () => {
  const loaded = loadContent(CONTENT);

  it("recognize -> chosenChoiceId", () => {
    const s = signalsFor({ stepKind: "recognize", choice: "b" }, loaded.miscons["mis.print.unquoted"]!, loaded);
    expect(s.chosenChoiceId).toBe("b");
  });

  it("recall -> recallInput", () => {
    const s = signalsFor({ stepKind: "recall", input: "str" }, loaded.miscons["mis.type.int_input"]!, loaded);
    expect(s.recallInput).toBe("str");
  });

  it("build fixture -> astTags from the owning node's build step", () => {
    const mis = loaded.miscons["mis.print.no_call"]!;
    const trigger = mis.triggers!.find((t) => t.stepKind === "build")!;
    const s = signalsFor(trigger, mis, loaded);
    expect(s.astTags).toBeInstanceOf(Set);
    expect([...(s.astTags ?? [])]).toContain("no_print_call");
  });
});

describe("planBuildSignals / finishBuildSignals (two-phase split)", () => {
  it("plan emits no exec work when the signature needs none", () => {
    const step = { kind: "build", evaluator: { ast: { queries: [] } } } as any;
    const { signals, plan } = planBuildSignals("x = 1", step, new Set(["astTags"]));
    expect(plan.needsExec).toBe(false);
    expect(signals.ran).toBe(true);
  });

  it("plan + runCases + finish === buildSignals for an exec-needing step", () => {
    const step = {
      kind: "build",
      evaluator: {
        run: { entrypoint: "sol" },
        tests: { cases: [{ input: [2], expected: 4 }] },
        ast: { queries: [] },
      },
    } as any;
    const code = "def sol(x):\n    return x * 2";
    const needs = new Set(["testFailure", "runError"]);
    const direct = buildSignals(code, step, needs);
    const { signals, plan } = planBuildSignals(code, step, needs);
    expect(plan.needsExec).toBe(true);
    const bare = runCases([plan.bareSpec!])[0]!;
    const caseResults = runCases(plan.caseSpecs!);
    expect(finishBuildSignals(signals, bare, caseResults)).toEqual(direct);
  });

  it("E-15 lockstep: a bare-run timeout short-circuits (timedOut, no tests)", () => {
    const step = {
      kind: "build",
      evaluator: {
        tests: { cases: [{ input: "x\n", expected: "x\n" }] },
        ast: { queries: [] },
      },
    } as any;
    const code = "while True:\n    pass";
    const { signals, plan } = planBuildSignals(code, step, new Set(["timedOut", "testFailure"]));
    expect(plan.needsExec).toBe(true);
    const finished = finishBuildSignals(signals, { ran: true, errType: "timeout", ok: false }, []);
    expect(finished.ran).toBe(false);
    expect(finished.timedOut).toBe(true);
    expect(finished.tests).toBeNull();
  });
});
