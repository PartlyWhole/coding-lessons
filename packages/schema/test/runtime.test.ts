import { describe, it, expect } from "vitest";
import { validate } from "../src/validate.js";
import { Signature, Diagnosis, LearnerModel, BehavioralEvent } from "../src/runtime.js";

describe("Signature", () => {
  it("accepts the §13.1 implicit_coercion signature", () => {
    const sig = { any: [{ runError: "runtime" }, { astTag: "implicit_coerce" }] };
    expect(validate(Signature, sig).ok).toBe(true);
  });

  it("accepts nested all/not combinators", () => {
    const sig = { all: [{ astTag: "loop" }, { not: { propertyFailed: true } }] };
    expect(validate(Signature, sig).ok).toBe(true);
  });
});

describe("Diagnosis", () => {
  it("accepts a build-step misconception diagnosis", () => {
    const d = {
      id: "diag.1",
      learnerId: "learner.abc",
      stepId: "cell.concat.intro#2",
      contentVersion: "2026.06.0",
      submittedAt: "2026-06-08T10:00:00.000Z",
      correct: false,
      attribution: "misconception",
      misconceptionId: "mis.concat.implicit_coercion",
      signals: { ran: true, wallMs: 42, astTags: ["implicit_coerce"] },
      skillDeltas: [{ skill: "skill.string.concat_str_num", kind: "misconception", weight: 0.3 }],
      seed: 1234,
    };
    expect(validate(Diagnosis, d).ok).toBe(true);
  });
});

describe("LearnerModel", () => {
  it("accepts a model with one skill state", () => {
    const m = {
      learnerId: "learner.abc",
      contentVersion: "2026.06.0",
      skills: {
        "skill.string.concat_str_num": {
          mastery: 0.4,
          attempts: 2,
          passes: 0,
          lastSeen: "2026-06-08T10:00:00.000Z",
          misconceptionCounts: { "mis.concat.implicit_coercion": 1 },
        },
      },
    };
    expect(validate(LearnerModel, m).ok).toBe(true);
  });
});

describe("BehavioralEvent", () => {
  it("accepts a submission event", () => {
    const e = {
      id: "ev.1",
      learnerId: "learner.abc",
      sessionId: "sess.1",
      seq: 7,
      stepId: "cell.concat.intro#2",
      ts: "2026-06-08T10:00:00.000Z",
      type: "submission",
      payload: { correct: false },
    };
    expect(validate(BehavioralEvent, e).ok).toBe(true);
  });
});
