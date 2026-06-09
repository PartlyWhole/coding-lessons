import { describe, it, expect } from "vitest";
import { diagnoseNonBuild, detect } from "../src/index.js";
import { bundle, recognizeStep } from "./fixtures.js";

describe("determinism", () => {
  const fx = { id: "d", learnerId: "L1", now: "2026-06-08T12:00:00.000Z" };

  it("same (step, submission, effects) → byte-identical Diagnosis", () => {
    const a = diagnoseNonBuild(recognizeStep, { kind: "recognize", choiceId: "b" }, bundle, fx);
    const b = diagnoseNonBuild(recognizeStep, { kind: "recognize", choiceId: "b" }, bundle, fx);
    expect(a).toEqual(b);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("detect is a pure function of its inputs", () => {
    const ctx = { signals: { ran: false, wallMs: 0 }, choiceId: "c" };
    expect(detect(recognizeStep, ctx, bundle)).toBe(detect(recognizeStep, ctx, bundle));
  });
});
