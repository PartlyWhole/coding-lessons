import { describe, it, expect } from "vitest";
import { resolve } from "node:path";
import { loadContent } from "../src/load.js";
import { gateFixtures } from "../src/gates/fixtures.js";

const CONTENT = resolve(__dirname, "../../../content");

describe("gate 5: misconception fixtures (real detector)", () => {
  it("every trigger fires and every notTrigger stays silent across all 21 misconceptions", () => {
    const issues = gateFixtures(loadContent(CONTENT));
    expect(issues.filter((i) => i.level === "error")).toEqual([]);
  });
});
