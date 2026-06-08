import { describe, it, expect } from "vitest";
import { canonicalJson, sha256hex } from "../src/hash.js";

describe("hash", () => {
  it("canonicalizes object key order (deterministic)", () => {
    expect(canonicalJson({ b: 1, a: 2 })).toBe(canonicalJson({ a: 2, b: 1 }));
    expect(canonicalJson({ a: [3, { y: 1, x: 2 }] })).toBe('{"a":[3,{"x":2,"y":1}]}');
  });
  it("hashes deterministically", () => {
    const h = sha256hex("hello");
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(sha256hex("hello")).toBe(h);
  });
});
