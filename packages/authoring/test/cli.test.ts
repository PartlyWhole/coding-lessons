import { describe, it, expect, afterAll } from "vitest";
import { resolve } from "node:path";
import { readFileSync, writeFileSync, existsSync, rmSync } from "node:fs";
import { main } from "../src/cli.js";

const ROOT = resolve(__dirname, "../../..");
const CONTENT = resolve(ROOT, "content");
const OUT = resolve(__dirname, "../.tmp-bundle.json");
const SUB = resolve(__dirname, "../.tmp-sub.py");

afterAll(() => {
  for (const f of [OUT, SUB]) if (existsSync(f)) rmSync(f);
});

describe("CLI", () => {
  it("lint passes on the corpus: prints stats + PASS and exits 0", () => {
    const log: string[] = [];
    const code = main(["lint", "--content", CONTENT], (s) => log.push(s));
    const out = log.join("");
    expect(out).toMatch(/nodes=7 skills=15 misconceptions=21/);
    expect(out).toMatch(/RESULT: PASS/);
    expect(code).toBe(0);
  });

  it("build writes a content-addressed bundle to --out and exits 0 (gates green)", () => {
    const code = main(["build", "--content", CONTENT, "--out", OUT], () => {});
    expect(existsSync(OUT)).toBe(true);
    const bundle = JSON.parse(readFileSync(OUT, "utf8"));
    expect(bundle.contentVersion).toMatch(/^ca-[0-9a-f]{16}$/);
    expect(Object.keys(bundle.nodes)).toHaveLength(7);
    expect(code).toBe(0);
  });

  it("grade dry-runs a submission and reports attribution (pass)", () => {
    writeFileSync(SUB, "def greet(name):\n    return \"Hi \" + name + \"!\"\n");
    const log: string[] = [];
    const code = main(["grade", "cell.string_concat.join_text#4", SUB, "--content", CONTENT], (s) => log.push(s));
    expect(code).toBe(0);
    expect(log.join("")).toMatch(/pass/i);
  });
});
