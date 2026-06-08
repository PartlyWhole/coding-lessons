import { describe, it, expect } from "vitest";
import { clamp01, DEFAULT_CONFIG } from "../src/config.js";

describe("clamp01", () => {
  it("clamps below 0 and above 1, passes through the middle", () => {
    expect(clamp01(-0.5)).toBe(0);
    expect(clamp01(1.5)).toBe(1);
    expect(clamp01(0.3)).toBeCloseTo(0.3, 10);
  });
});

describe("DEFAULT_CONFIG", () => {
  it("exposes the tuning constants in [0,1] where applicable", () => {
    expect(DEFAULT_CONFIG.learnRate).toBeGreaterThan(0);
    expect(DEFAULT_CONFIG.learnRate).toBeLessThanOrEqual(1);
    expect(DEFAULT_CONFIG.completionThreshold).toBeGreaterThan(0);
    expect(DEFAULT_CONFIG.completionThreshold).toBeLessThanOrEqual(1);
  });
});
