import { describe, it, expect } from "vitest";
import type { GenSpec } from "@trellis/schema";
import { genValue, genArgs } from "../src/generators.js";
import { makePrng } from "../src/prng.js";

describe("genValue", () => {
  it("int respects [min,max] inclusive", () => {
    const spec: GenSpec = { param: "n", type: "int", min: 1, max: 5 };
    const p = makePrng(1234);
    for (let i = 0; i < 500; i++) {
      const v = genValue(spec, p) as number;
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(1);
      expect(v).toBeLessThanOrEqual(5);
    }
  });
  it("str respects length bounds and alphabet", () => {
    const spec: GenSpec = { param: "s", type: "str", min: 0, max: 8, alphabet: "abc" };
    const p = makePrng(1234);
    for (let i = 0; i < 500; i++) {
      const v = genValue(spec, p) as string;
      expect(v.length).toBeGreaterThanOrEqual(0);
      expect(v.length).toBeLessThanOrEqual(8);
      expect([...v].every((c) => "abc".includes(c))).toBe(true);
    }
  });
  it("list uses elem spec and length bounds", () => {
    const spec: GenSpec = { param: "xs", type: "list", min: 0, max: 4, elem: { type: "int", min: 0, max: 9 } };
    const p = makePrng(1234);
    const v = genValue(spec, p) as number[];
    expect(Array.isArray(v)).toBe(true);
    expect(v.length).toBeLessThanOrEqual(4);
    expect(v.every((n) => n >= 0 && n <= 9)).toBe(true);
  });
  it("choice picks only from the provided set", () => {
    const spec: GenSpec = { param: "c", type: "choice", choices: ["x", "y", "z"] };
    const p = makePrng(1234);
    expect(["x", "y", "z"]).toContain(genValue(spec, p));
  });
  it("bool yields a boolean", () => {
    expect(typeof genValue({ param: "b", type: "bool" }, makePrng(1))).toBe("boolean");
  });
  it("is deterministic for a fixed seed", () => {
    const spec: GenSpec = { param: "n", type: "int", min: 1, max: 100 };
    expect(genValue(spec, makePrng(99))).toBe(genValue(spec, makePrng(99)));
  });
});

describe("genArgs", () => {
  it("returns args in generator order", () => {
    const gens: GenSpec[] = [
      { param: "a", type: "int", min: 1, max: 5 },
      { param: "b", type: "int", min: 50, max: 100 },
    ];
    const args = genArgs(gens, makePrng(1234));
    expect(args).toHaveLength(2);
    expect(args[0]).toBeGreaterThanOrEqual(1);
    expect(args[0]).toBeLessThanOrEqual(5);
    expect(args[1]).toBeGreaterThanOrEqual(50);
    expect(args[1]).toBeLessThanOrEqual(100);
  });
});
