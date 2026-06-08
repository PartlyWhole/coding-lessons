import { describe, it, expect } from "vitest";
import {
  matchesAccepted,
  compareNonBuild,
  diagnoseNonBuild,
  type NonBuildSubmission,
  type DiagnoseEffects,
} from "../src/diagnose.js";
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
