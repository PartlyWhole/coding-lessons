import { describe, it, expect } from "vitest";
import { normalize } from "../src/normalize.js";

describe("normalize", () => {
  it("trims, lowercases, and collapses internal whitespace", () => {
    expect(normalize("  Hello   World  ")).toBe("hello world");
    expect(normalize("A\tB\nC")).toBe("a b c");
    expect(normalize("already")).toBe("already");
  });
});
