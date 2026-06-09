import { describe, it, expect } from "vitest";
import { resolve } from "node:path";
import { loadContent } from "../src/load.js";
import { gateGolden } from "../src/gates/golden.js";

const CONTENT = resolve(__dirname, "../../../content");

describe("gate 7: golden Diagnosis snapshots (plug-in stub)", () => {
  it("passes with an informational note when the corpus has no golden snapshots", () => {
    const issues = gateGolden(loadContent(CONTENT));
    expect(issues.filter((i) => i.level === "error")).toEqual([]);
    expect(issues.some((i) => i.level === "warn" && /no golden/i.test(i.message))).toBe(true);
  });
});
