import { describe, it, expect } from "vitest";
import * as engine from "../src/index.js";

describe("@trellis/engine public API", () => {
  it("exports the documented surface", () => {
    for (const name of [
      "resolveAvailability",
      "nextSpineCell",
      "availabilityDiff",
      "step",
      "detect",
      "diagnoseNonBuild",
      "applyDiagnosis",
      "targetUpstream",
    ] as const) {
      expect(typeof engine[name]).toBe("function");
    }
    expect(engine.DEFAULT_CONFIG.learnRate).toBeGreaterThan(0);
  });
});
