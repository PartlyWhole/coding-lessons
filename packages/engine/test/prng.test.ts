import { describe, it, expect } from "vitest";
import { makePrng } from "../src/prng.js";

describe("makePrng", () => {
  it("is deterministic: same seed → identical stream", () => {
    const a = makePrng(1234);
    const b = makePrng(1234);
    const seqA = Array.from({ length: 8 }, () => a.nextU32());
    const seqB = Array.from({ length: 8 }, () => b.nextU32());
    expect(seqA).toEqual(seqB);
  });
  it("different seeds diverge", () => {
    const a = makePrng(1);
    const b = makePrng(2);
    expect(a.nextU32()).not.toBe(b.nextU32());
  });
  it("nextInt is inclusive on both ends and stays in range", () => {
    const p = makePrng(42);
    for (let i = 0; i < 1000; i++) {
      const v = p.nextInt(3, 7);
      expect(v).toBeGreaterThanOrEqual(3);
      expect(v).toBeLessThanOrEqual(7);
      expect(Number.isInteger(v)).toBe(true);
    }
  });
  it("nextInt(n, n) returns n", () => {
    expect(makePrng(9).nextInt(5, 5)).toBe(5);
  });
  it("nextFloat is in [0,1)", () => {
    const p = makePrng(7);
    for (let i = 0; i < 1000; i++) {
      const v = p.nextFloat();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
  it("pick selects a member deterministically", () => {
    expect(makePrng(3).pick(["a", "b", "c"])).toBe(makePrng(3).pick(["a", "b", "c"]));
  });
});
