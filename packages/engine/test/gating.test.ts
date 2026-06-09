import { describe, it, expect } from "vitest";
import {
  resolveAvailability,
  availabilityDiff,
  applyDiagnosis,
  diagnoseNonBuild,
} from "../src/index.js";
import type { Diagnosis } from "@trellis/schema";
import { graph, bundle, model, recognizeStep } from "./fixtures.js";

describe("MILESTONE GATE — random extension gating diff", () => {
  it("one prerequisite met (print_literal) but var.assign unmet → random LOCKED", () => {
    const m = model({ "skill.output.print_literal": 0.5, "skill.var.assign": 0.5 });
    expect(resolveAvailability(m, graph)["node.random"]).toBe("locked");
  });

  it("both prerequisites met (var.assign crosses 0.6) → random AVAILABLE", () => {
    const m = model({ "skill.output.print_literal": 0.5, "skill.var.assign": 0.6 });
    expect(resolveAvailability(m, graph)["node.random"]).toBe("available");
  });

  it("the availability DIFF reports node.random as newly unlocked when var.assign crosses 0.6", () => {
    const before = resolveAvailability(
      model({ "skill.output.print_literal": 0.5, "skill.var.assign": 0.59 }),
      graph,
    );
    const after = resolveAvailability(
      model({ "skill.output.print_literal": 0.5, "skill.var.assign": 0.6 }),
      graph,
    );
    expect(before["node.random"]).toBe("locked");
    expect(after["node.random"]).toBe("available");
    expect(availabilityDiff(before, after).newlyAvailable).toContain("node.random");
  });

  it("end-to-end: applying a pass Diagnosis that lifts var.assign over 0.6 unlocks random", () => {
    const start = model({ "skill.output.print_literal": 0.5, "skill.var.assign": 0.2 });
    const before = resolveAvailability(start, graph);
    expect(before["node.random"]).toBe("locked");

    const passDiag: Diagnosis = {
      id: "d1",
      learnerId: "L1",
      stepId: "cell.variables.box#x",
      contentVersion: "2026.06.0-test",
      submittedAt: "2026-06-08T12:00:00.000Z",
      correct: true,
      attribution: "pass",
      signals: { ran: false, wallMs: 0 },
      skillDeltas: [{ skill: "skill.var.assign", kind: "pass", weight: 1 }],
      seed: 0,
    };
    const updated = applyDiagnosis(start, passDiag);
    expect(updated.skills["skill.var.assign"]!.mastery).toBeCloseTo(0.6, 10);

    const after = resolveAvailability(updated, graph);
    expect(after["node.random"]).toBe("available");
    expect(availabilityDiff(before, after).newlyAvailable).toContain("node.random");
  });
});

describe("MILESTONE GATE — non-build attribution precedence", () => {
  const fx = { id: "d", learnerId: "L1", now: "2026-06-08T12:00:00.000Z" };
  it("pass / misconception / mismatch on the recognize step", () => {
    const pass = diagnoseNonBuild(recognizeStep, { kind: "recognize", choiceId: "a" }, bundle, fx);
    const misc = diagnoseNonBuild(recognizeStep, { kind: "recognize", choiceId: "b" }, bundle, fx);
    const mism = diagnoseNonBuild(recognizeStep, { kind: "recognize", choiceId: "d" }, bundle, fx);
    expect(pass.attribution).toBe("pass");
    expect(misc.attribution).toBe("misconception");
    expect(misc.misconceptionId).toBe("mis.random.no_import");
    expect(mism.attribution).toBe("mismatch");
  });
});
