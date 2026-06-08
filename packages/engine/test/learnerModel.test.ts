import { describe, it, expect } from "vitest";
import { newSkillState, applyDiagnosis, targetUpstream } from "../src/learnerModel.js";
import { DEFAULT_CONFIG } from "../src/config.js";
import type { Diagnosis } from "@trellis/schema";
import { bundle, model } from "./fixtures.js";

function diag(partial: Partial<Diagnosis> & Pick<Diagnosis, "skillDeltas">): Diagnosis {
  return {
    id: "d",
    learnerId: "L1",
    stepId: "s",
    contentVersion: "2026.06.0-test",
    submittedAt: "2026-06-08T12:00:00.000Z",
    correct: true,
    attribution: "pass",
    signals: { ran: false, wallMs: 0 },
    seed: 0,
    ...partial,
  };
}

describe("newSkillState", () => {
  it("starts at zero mastery with the provided timestamp", () => {
    const s = newSkillState("2026-06-08T00:00:00.000Z");
    expect(s).toEqual({
      mastery: 0,
      attempts: 0,
      passes: 0,
      lastSeen: "2026-06-08T00:00:00.000Z",
      misconceptionCounts: {},
    });
  });
});

describe("applyDiagnosis", () => {
  it("a pass raises mastery with diminishing returns and does not mutate the input", () => {
    const before = model({ "skill.var.assign": 0.0 });
    const d = diag({ skillDeltas: [{ skill: "skill.var.assign", kind: "pass", weight: 1 }] });
    const after = applyDiagnosis(before, d, DEFAULT_CONFIG);
    expect(after.skills["skill.var.assign"]!.mastery).toBeCloseTo(0.5, 10);
    expect(after.skills["skill.var.assign"]!.attempts).toBe(2);
    expect(after.skills["skill.var.assign"]!.passes).toBe(2);
    expect(before.skills["skill.var.assign"]!.mastery).toBe(0.0);
  });

  it("a misconception lowers mastery and bumps the misconception count", () => {
    const before = model({ "skill.random.randint": 0.5 });
    const d = diag({
      correct: false,
      attribution: "misconception",
      misconceptionId: "mis.random.no_import",
      skillDeltas: [{ skill: "skill.random.randint", kind: "misconception", weight: 0.4 }],
    });
    const after = applyDiagnosis(before, d, DEFAULT_CONFIG);
    expect(after.skills["skill.random.randint"]!.mastery).toBeCloseTo(0.44, 10);
    expect(after.skills["skill.random.randint"]!.misconceptionCounts["mis.random.no_import"]).toBe(1);
  });

  it("a generic fail applies the small penalty and creates a missing skill state", () => {
    const before = model({});
    const d = diag({
      correct: false,
      attribution: "mismatch",
      skillDeltas: [{ skill: "skill.var.assign", kind: "fail", weight: 1 }],
    });
    const after = applyDiagnosis(before, d, DEFAULT_CONFIG);
    expect(after.skills["skill.var.assign"]!.mastery).toBe(0);
    expect(after.skills["skill.var.assign"]!.attempts).toBe(1);
  });
});

describe("targetUpstream", () => {
  it("returns the lowest-mastery upstream skill below threshold, ties by id", () => {
    const m = model({ "skill.var.assign": 0.3, "skill.output.print_literal": 0.7 });
    expect(targetUpstream(m, "skill.random.randint", bundle, DEFAULT_CONFIG)).toBe("skill.var.assign");
  });

  it("returns null when all upstream skills are at/above threshold", () => {
    const m = model({ "skill.var.assign": 0.9, "skill.output.print_literal": 0.9 });
    expect(targetUpstream(m, "skill.random.randint", bundle, DEFAULT_CONFIG)).toBeNull();
  });
});
