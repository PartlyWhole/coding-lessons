import { describe, it, expect } from "vitest";
import { resolve } from "node:path";
import { loadContent } from "../src/load.js";
import { compile } from "../src/compile.js";
import { runAllGates } from "../src/gates/run.js";

const CONTENT = resolve(__dirname, "../../../content");

describe("runAllGates", () => {
  const loaded = loadContent(CONTENT);
  const report = runAllGates(loaded, compile(loaded));

  // KNOWN-ISSUE PIN (see ESCALATION: @trellis/schema GenSpec requires `param` on nested `elem`,
  // which cell.loops.guessing_game#5 correctly omits). Gates 2-7 + all lints are green; gate 1
  // reports exactly this one error. After the schema fix rebases, flip the first two assertions
  // to: expect(report.ok).toBe(true); expect(errors).toEqual([]);
  it("reports the corpus as green EXCEPT the one escalated gate-1 schema defect", () => {
    const errors = report.issues.filter((i) => i.level === "error");
    // everything we built (gates 2-7 + lints) contributes zero errors:
    expect(errors.filter((e) => e.gate !== "1-schema")).toEqual([]);
    // gate 1 reports exactly the single escalated defect:
    const schemaErrors = errors.filter((e) => e.gate === "1-schema");
    expect(schemaErrors).toHaveLength(1);
    expect(schemaErrors[0]!.message).toContain("cell.loops.guessing_game");
    expect(report.ok).toBe(false); // because of that one gate-1 error
  });

  it("reports stats for the corpus", () => {
    expect(report.stats).toMatchObject({ nodes: 7, skills: 15, misconceptions: 21 });
    expect(report.stats.cells).toBeGreaterThan(0);
  });

  it("can skip the exec gates (5/6) via runExecGates:false", () => {
    const fast = runAllGates(loaded, compile(loaded), { runExecGates: false });
    // still includes gate 1's known error, but does not invoke python3 for gates 5/6
    expect(fast.issues.some((i) => i.gate === "5-fixtures")).toBe(false);
    expect(fast.issues.some((i) => i.gate === "6-oracle")).toBe(false);
  });
});
