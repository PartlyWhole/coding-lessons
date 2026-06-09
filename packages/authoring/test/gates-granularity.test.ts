import { describe, it, expect } from "vitest";
import { resolve } from "node:path";
import { loadContent } from "../src/load.js";
import { gateGranularity } from "../src/gates/granularity.js";

const CONTENT = resolve(__dirname, "../../../content");

describe("gate 4: granularity", () => {
  it("passes on the real corpus (every skill 1..6 misconceptions, >=1 certifying step)", () => {
    const issues = gateGranularity(loadContent(CONTENT));
    expect(issues.filter((i) => i.level === "error")).toEqual([]);
  });

  it("errors on a skill with 0 misconceptions", () => {
    const loaded = {
      nodes: { n: { id: "n", title: "", track: "spine" as const, requires: [], teaches: ["lonely"], cells: [
        { id: "c", title: "", certifies: ["lonely"], steps: [{ id: "c#0", kind: "build" as const }] }] } },
      skills: { lonely: { id: "lonely", title: "", description: "" } },
      miscons: {},
    };
    expect(gateGranularity(loaded).some((i) => /0 misconceptions/.test(i.message))).toBe(true);
  });
});
