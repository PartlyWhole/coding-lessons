import { describe, it, expect } from "vitest";
import { Type } from "@sinclair/typebox";
import { validate, assertValid } from "../src/validate.js";

const Point = Type.Object({ x: Type.Number(), y: Type.Number() });

describe("validate", () => {
  it("accepts a valid value", () => {
    expect(validate(Point, { x: 1, y: 2 }).ok).toBe(true);
  });

  it("rejects an invalid value and reports the failing path", () => {
    const result = validate(Point, { x: 1, y: "nope" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      const first = result.errors[0];
      expect(first?.path).toBe("/y");
    }
  });
});

describe("assertValid", () => {
  it("returns the value when valid", () => {
    expect(assertValid(Point, { x: 1, y: 2 })).toEqual({ x: 1, y: 2 });
  });

  it("throws with a path-annotated message when invalid", () => {
    expect(() => assertValid(Point, { x: 1 })).toThrowError(/\/y/);
  });
});
