import { describe, it, expect } from "vitest";
import { resolve } from "node:path";
import { loadContent } from "../src/load.js";
import { compile } from "../src/compile.js";
import { runAllGates } from "../src/gates/run.js";

const CONTENT = resolve(__dirname, "../../../content");

describe("runAllGates", () => {
  const loaded = loadContent(CONTENT);
  const report = runAllGates(loaded, compile(loaded));

  // All seven gates + the three lints pass on the corpus (the GenSpec.elem.param defect was
  // resolved on main and rebased in).
  it("reports the corpus as fully green (no error-level issues across all gates + lints)", () => {
    expect(report.issues.filter((i) => i.level === "error")).toEqual([]);
    expect(report.ok).toBe(true);
  });

  it("reports stats for the corpus", () => {
    expect(report.stats).toMatchObject({ nodes: 7, skills: 15, misconceptions: 21 });
    expect(report.stats.cells).toBeGreaterThan(0);
  });

  it("runs gates 8/9 (pure, never skipped): corpus is clean for both (aacf0ce fixed the 4 findings)", () => {
    const fast = runAllGates(loaded, compile(loaded), { runExecGates: false });
    expect(fast.issues.filter((i) => i.gate === "9-correct-miscon")).toEqual([]);
    expect(fast.issues.filter((i) => i.gate === "8-answerable")).toEqual([]);
    expect(fast.ok).toBe(true);
  });

  it("can skip the exec gates (5/6) via runExecGates:false", () => {
    const fast = runAllGates(loaded, compile(loaded), { runExecGates: false });
    // still includes gate 1's known error, but does not invoke python3 for gates 5/6
    expect(fast.issues.some((i) => i.gate === "5-fixtures")).toBe(false);
    expect(fast.issues.some((i) => i.gate === "6-oracle")).toBe(false);
  });
});
