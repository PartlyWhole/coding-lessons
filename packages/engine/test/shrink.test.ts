import { describe, it, expect } from "vitest";
import type { GenSpec } from "@trellis/schema";
import { shrink } from "../src/shrink.js";

describe("shrink", () => {
  it("shrinks an int toward its min while the predicate fails", () => {
    const spec: GenSpec = { param: "n", type: "int", min: 0, max: 100 };
    const result = shrink(spec, 87, (c) => (c as number) >= 10);
    expect(result).toBe(10);
  });
  it("shrinks a string toward its min length", () => {
    const spec: GenSpec = { param: "s", type: "str", min: 0, max: 12, alphabet: "ab" };
    const result = shrink(spec, "aababb", (c) => (c as string).length >= 2) as string;
    expect(result.length).toBe(2);
  });
  it("shrinks a list toward its min length", () => {
    const spec: GenSpec = { param: "xs", type: "list", min: 0, max: 8, elem: { type: "int", min: 0, max: 9 } };
    const result = shrink(spec, [3, 1, 4, 1, 5], (c) => (c as number[]).length >= 1) as number[];
    expect(result.length).toBe(1);
  });
  it("returns the original when no smaller candidate fails", () => {
    const spec: GenSpec = { param: "n", type: "int", min: 0, max: 100 };
    expect(shrink(spec, 5, (c) => (c as number) === 5)).toBe(5);
  });
  it("is deterministic", () => {
    const spec: GenSpec = { param: "n", type: "int", min: 0, max: 100 };
    const f = (c: unknown) => (c as number) >= 10;
    expect(shrink(spec, 87, f)).toBe(shrink(spec, 87, f));
  });
});
