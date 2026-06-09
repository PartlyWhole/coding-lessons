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
  it("lint prints stats and (currently) exits 1 due to the one escalated gate-1 defect", () => {
    // After the @trellis/schema GenSpec.elem.param fix rebases, lint exits 0 and prints PASS.
    const log: string[] = [];
    const code = main(["lint", "--content", CONTENT], (s) => log.push(s));
    const out = log.join("");
    expect(out).toMatch(/nodes=7 skills=15 misconceptions=21/);
    expect(out).toMatch(/cell\.loops\.guessing_game/); // the one known schema error
    expect(code).toBe(1);
  });

  it("build writes a content-addressed bundle to --out (exit reflects gate status)", () => {
    const code = main(["build", "--content", CONTENT, "--out", OUT], () => {});
    expect(existsSync(OUT)).toBe(true);
    const bundle = JSON.parse(readFileSync(OUT, "utf8"));
    expect(bundle.contentVersion).toMatch(/^ca-[0-9a-f]{16}$/);
    expect(Object.keys(bundle.nodes)).toHaveLength(7);
    expect(code).toBe(1); // currently 1 due to the escalated gate-1 defect; flips to 0 after rebase
  });

  it("grade dry-runs a submission and reports attribution (pass)", () => {
    writeFileSync(SUB, "def greet(name):\n    return \"Hi \" + name + \"!\"\n");
    const log: string[] = [];
    const code = main(["grade", "cell.string_concat.join_text#4", SUB, "--content", CONTENT], (s) => log.push(s));
    expect(code).toBe(0);
    expect(log.join("")).toMatch(/pass/i);
  });
});
