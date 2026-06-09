import { describe, it, expect } from "vitest";
import { resolve } from "node:path";
import { Value } from "@sinclair/typebox/value";
import { Bundle } from "@trellis/schema";
import { loadContent } from "../src/load.js";
import { compile } from "../src/compile.js";
import { runAllGates } from "../src/gates/run.js";

const CONTENT = resolve(__dirname, "../../../content");

describe("M1 milestone gate: proving-slice corpus", () => {
  const loaded = loadContent(CONTENT);
  const bundle = compile(loaded);
  const report = runAllGates(loaded, bundle);

  it("compiles the corpus to a schema-valid bundle and passes all gates", () => {
    expect(Value.Check(Bundle, bundle)).toBe(true);
    expect([...Value.Errors(Bundle, bundle)]).toEqual([]);
    expect(report.issues.filter((i) => i.level === "error")).toEqual([]);
    expect(report.ok).toBe(true);
  });

  it("reports the proving-slice stats (7 nodes / 15 skills / 21 misconceptions)", () => {
    expect(report.stats).toMatchObject({ nodes: 7, skills: 15, misconceptions: 21 });
  });
});
