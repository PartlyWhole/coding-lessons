import { describe, it, expect } from "vitest";
import { compareValues, floatClose, setEqual } from "../src/compare.js";

describe("floatClose", () => {
  it("accepts values within abs+rel tolerance and rejects outside", () => {
    expect(floatClose(1.0, 1.0 + 1e-12)).toBe(true);
    expect(floatClose(1000.0, 1000.0 + 1e-7)).toBe(true); // rel tolerance
    expect(floatClose(1.0, 1.2)).toBe(false);
  });
  it("is total over non-numbers (falls back to structural)", () => {
    expect(floatClose("a", "a")).toBe(true);
    expect(floatClose("a", "b")).toBe(false);
    expect(floatClose([1.0], [1.0 + 1e-12])).toBe(true);
    expect(floatClose({ x: 1.0 }, { x: 1.0 + 1e-12 })).toBe(true);
  });
  it("NaN is never close, including to itself (IEEE semantics)", () => {
    expect(floatClose(Number.NaN, Number.NaN)).toBe(false);
    expect(floatClose(Number.NaN, 1)).toBe(false);
  });
  it("empty arrays are close", () => {
    expect(floatClose([], [])).toBe(true);
  });
});

describe("setEqual", () => {
  it("is order-insensitive for arrays", () => {
    expect(setEqual([1, 2, 3], [3, 2, 1])).toBe(true);
    expect(setEqual([1, 2, 2], [2, 1, 2])).toBe(true); // multiset
    expect(setEqual([1, 2, 2], [1, 2])).toBe(false);
    expect(setEqual([1, 2], [1, 3])).toBe(false);
  });
  it("empty arrays are equal; non-arrays fall back to deepEqual", () => {
    expect(setEqual([], [])).toBe(true);
    expect(setEqual({ a: 1 }, { a: 1 })).toBe(true);
    expect(setEqual("x", "x")).toBe(true);
    expect(setEqual("x", "y")).toBe(false);
  });
});

describe("compareValues dispatch", () => {
  it("defaults to deep-equal when comparator is undefined", () => {
    expect(compareValues(undefined, { a: 1 }, { a: 1 })).toBe(true);
    expect(compareValues("deep-equal", [1, 2], [2, 1])).toBe(false); // order-sensitive
  });
  it("routes to float-close and set-equal", () => {
    expect(compareValues("float-close", 1.0, 1.0 + 1e-12)).toBe(true);
    expect(compareValues("set-equal", [1, 2], [2, 1])).toBe(true);
  });
});
