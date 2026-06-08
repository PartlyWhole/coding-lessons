import { describe, it, expect } from "vitest";
import {
  matchesAccepted,
  compareNonBuild,
  computeDeltas,
  diagnoseNonBuild,
  type NonBuildSubmission,
  type DiagnoseEffects,
} from "../src/diagnose.js";
import { DEFAULT_CONFIG } from "../src/config.js";
import type { PredictStep } from "@trellis/schema";
import { bundle, recognizeStep, recallStep, predictStep } from "./fixtures.js";

const fx: DiagnoseEffects = { id: "diag-1", learnerId: "L1", now: "2026-06-08T12:00:00.000Z" };

describe("matchesAccepted", () => {
  it("matches a normalized accepted answer", () => {
    expect(matchesAccepted({ normalized: ["import random"] }, "  Import   Random ")).toBe(true);
    expect(matchesAccepted({ normalized: ["import random"] }, "random")).toBe(false);
  });

  it("matches an anchored RE2 pattern", () => {
    expect(matchesAccepted({ patterns: ["import\\s+random"] }, "import   random")).toBe(true);
    expect(matchesAccepted({ patterns: ["import\\s+random"] }, "import random now")).toBe(false);
    expect(matchesAccepted({ patterns: ["import\\s+random.*"] }, "import random now")).toBe(true);
  });
});

describe("compareNonBuild", () => {
  it("recognize: correct iff choiceId === correctChoiceId", () => {
    expect(compareNonBuild(recognizeStep, { kind: "recognize", choiceId: "a" })).toBe(true);
    expect(compareNonBuild(recognizeStep, { kind: "recognize", choiceId: "b" })).toBe(false);
  });

  it("recall: correct iff text matches accepted", () => {
    expect(compareNonBuild(recallStep, { kind: "recall", text: "import random" })).toBe(true);
    expect(compareNonBuild(recallStep, { kind: "recall", text: "nope" })).toBe(false);
  });

  it("predict (choice mode): correct iff chosen id is in expected.normalized", () => {
    expect(compareNonBuild(predictStep, { kind: "predict", choiceId: "a" })).toBe(true);
    expect(compareNonBuild(predictStep, { kind: "predict", choiceId: "b" })).toBe(false);
  });
});

describe("diagnoseNonBuild — attribution precedence", () => {
  it("pass: a correct recognize submission", () => {
    const d = diagnoseNonBuild(recognizeStep, { kind: "recognize", choiceId: "a" }, bundle, fx);
    expect(d.correct).toBe(true);
    expect(d.attribution).toBe("pass");
    expect(d.misconceptionId).toBeUndefined();
    expect(d.skillDeltas).toEqual([{ skill: "skill.random.randint", kind: "pass", weight: 1 }]);
  });

  it("misconception: a wrong choice with an authored misconception", () => {
    const d = diagnoseNonBuild(recognizeStep, { kind: "recognize", choiceId: "b" }, bundle, fx);
    expect(d.correct).toBe(false);
    expect(d.attribution).toBe("misconception");
    expect(d.misconceptionId).toBe("mis.random.no_import");
    expect(d.skillDeltas).toEqual([{ skill: "skill.random.randint", kind: "misconception", weight: 0.4 }]);
  });

  it("mismatch: a wrong choice with no misconception and no matching signature", () => {
    const d = diagnoseNonBuild(recognizeStep, { kind: "recognize", choiceId: "d" }, bundle, fx);
    expect(d.correct).toBe(false);
    expect(d.attribution).toBe("mismatch");
    expect(d.misconceptionId).toBeUndefined();
    expect(d.skillDeltas).toEqual([{ skill: "skill.random.randint", kind: "fail", weight: 1 }]);
  });

  it("recall: misconceptionMap routes a known wrong answer to its misconception", () => {
    const d = diagnoseNonBuild(recallStep, { kind: "recall", text: "use random.randint" }, bundle, fx);
    expect(d.attribution).toBe("misconception");
    expect(d.misconceptionId).toBe("mis.random.no_import");
  });

  it("stamps the injected effects and a minimal RawSignals", () => {
    const d = diagnoseNonBuild(recognizeStep, { kind: "recognize", choiceId: "a" }, bundle, fx);
    expect(d.id).toBe("diag-1");
    expect(d.learnerId).toBe("L1");
    expect(d.submittedAt).toBe("2026-06-08T12:00:00.000Z");
    expect(d.stepId).toBe("cell.random.intro#3");
    expect(d.contentVersion).toBe("2026.06.0-test");
    expect(d.signals).toEqual({ ran: false, wallMs: 0 });
    expect(d.seed).toBe(0);
  });
});

const _typecheck: NonBuildSubmission = { kind: "recognize", choiceId: "a" };
void _typecheck;

describe("diagnoseNonBuild — predict path", () => {
  it("predict choice-mode: a correct choice is a pass", () => {
    const d = diagnoseNonBuild(predictStep, { kind: "predict", choiceId: "a" }, bundle, fx);
    expect(d.correct).toBe(true);
    expect(d.attribution).toBe("pass");
  });

  it("predict choice-mode: a wrong choice with an authored misconception", () => {
    const d = diagnoseNonBuild(predictStep, { kind: "predict", choiceId: "b" }, bundle, fx);
    expect(d.attribution).toBe("misconception");
    expect(d.misconceptionId).toBe("mis.random.no_import");
  });

  it("predict choice-mode: a wrong choice with no direct map falls back to signature detect", () => {
    // choice c has no .misconception, but mis.random.range_off_by_one's signature has {choice:"c"}.
    const d = diagnoseNonBuild(predictStep, { kind: "predict", choiceId: "c" }, bundle, fx);
    expect(d.attribution).toBe("misconception");
    expect(d.misconceptionId).toBe("mis.random.range_off_by_one");
  });

  const predictText: PredictStep = {
    id: "p.text#1",
    kind: "predict",
    skills: ["skill.random.randint"],
    prompt: "predict the output",
    code: "print(2 + 2)",
    expected: { normalized: ["4"], misconceptionMap: { "5": "mis.random.no_import" } },
    reveal: "run-and-show",
  };

  it("predict text-mode: correct text is a pass", () => {
    const d = diagnoseNonBuild(predictText, { kind: "predict", text: "4" }, bundle, fx);
    expect(d.correct).toBe(true);
    expect(d.attribution).toBe("pass");
  });

  it("predict text-mode: a mapped wrong answer routes to its misconception", () => {
    const d = diagnoseNonBuild(predictText, { kind: "predict", text: "5" }, bundle, fx);
    expect(d.attribution).toBe("misconception");
    expect(d.misconceptionId).toBe("mis.random.no_import");
  });

  it("predict text-mode: an unmapped wrong answer is a mismatch", () => {
    const d = diagnoseNonBuild(predictText, { kind: "predict", text: "7" }, bundle, fx);
    expect(d.attribution).toBe("mismatch");
    expect(d.misconceptionId).toBeUndefined();
  });

  const predictPrecedence: PredictStep = {
    id: "p.prec#1",
    kind: "predict",
    skills: ["skill.random.randint"],
    prompt: "x",
    code: "y",
    choices: [
      { id: "a", label: "A" },
      { id: "b", label: "B", misconception: "mis.random.range_off_by_one" },
    ],
    expected: { normalized: ["a"], misconceptionMap: { b: "mis.random.no_import" } },
    reveal: "run-and-show",
  };

  it("predict choice-mode: expected.misconceptionMap takes precedence over choice.misconception", () => {
    const d = diagnoseNonBuild(predictPrecedence, { kind: "predict", choiceId: "b" }, bundle, fx);
    // map entry (no_import) must win over the choice's own (range_off_by_one).
    expect(d.misconceptionId).toBe("mis.random.no_import");
  });
});

describe("computeDeltas — dangling misconception ref", () => {
  it("falls back to generic fail deltas when mid is absent from the bundle", () => {
    const deltas = computeDeltas(recognizeStep, false, "mis.does.not.exist", bundle, DEFAULT_CONFIG);
    expect(deltas).toEqual([{ skill: "skill.random.randint", kind: "fail", weight: 1 }]);
  });
});
