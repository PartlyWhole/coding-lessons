import { describe, it, expect, afterEach } from "vitest";
import { resolve } from "node:path";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { loadContent } from "../src/load.js";

const CONTENT = resolve(__dirname, "../../../content");
const TMP = resolve(__dirname, "../.tmp-dup-content");

/** Build a minimal content tree under TMP with the given skills/*.yaml docs. */
function writeTmpContent(skillDocs: string): string {
  rmSync(TMP, { recursive: true, force: true });
  mkdirSync(resolve(TMP, "nodes"), { recursive: true });
  mkdirSync(resolve(TMP, "skills"), { recursive: true });
  writeFileSync(resolve(TMP, "skills", "dup.taxonomy.yaml"), skillDocs);
  return TMP;
}

describe("loadContent", () => {
  const loaded = loadContent(CONTENT);

  it("loads the corpus counts (7 nodes, 15 skills, 21 misconceptions)", () => {
    expect(Object.keys(loaded.nodes)).toHaveLength(7);
    expect(Object.keys(loaded.skills)).toHaveLength(15);
    expect(Object.keys(loaded.miscons)).toHaveLength(21);
  });

  it("preserves source-only fields (triggers/notTriggers/upstream) for the gates", () => {
    const mis = loaded.miscons["mis.loop.infinite_true"];
    expect(mis).toBeDefined();
    expect(mis!.triggers?.length).toBeGreaterThan(0);
    expect(mis!.notTriggers?.length).toBeGreaterThan(0);
    expect(mis!._skill).toBe("skill.loop.while");
    expect(loaded.skills["skill.string.concat"]!.upstream).toContain("skill.string.literal");
  });

  it("keeps inline cells on nodes and tags each misconception with its owning skill", () => {
    const node = loaded.nodes["node.output"];
    expect(node!.cells.length).toBeGreaterThan(0);
    expect(node!.cells[0]!.steps.length).toBeGreaterThan(0);
    expect(loaded.miscons["mis.print.no_call"]!._skill).toBe("skill.output.print_literal");
  });

  it("does not throw on the (duplicate-free) corpus", () => {
    expect(() => loadContent(CONTENT)).not.toThrow();
  });
});

describe("loadContent duplicate detection", () => {
  afterEach(() => {
    rmSync(TMP, { recursive: true, force: true });
  });

  it("throws on a duplicate skill id", () => {
    const dir = writeTmpContent(
      [
        "skill:",
        "  id: skill.dup.example",
        '  title: "First"',
        '  description: "first copy"',
        "---",
        "skill:",
        "  id: skill.dup.example",
        '  title: "Second"',
        '  description: "second copy"',
        "",
      ].join("\n"),
    );
    expect(() => loadContent(dir)).toThrow(/duplicate skill id/);
  });

  it("throws on a duplicate misconception id", () => {
    const dir = writeTmpContent(
      [
        "skill:",
        "  id: skill.dup.first",
        '  title: "First"',
        '  description: "first"',
        "  misconceptions:",
        "    - id: mis.dup.example",
        "      skill: skill.dup.first",
        '      title: "A"',
        "      signature: { choice: a }",
        "      hintLadder: []",
        '      feedback: "a"',
        "---",
        "skill:",
        "  id: skill.dup.second",
        '  title: "Second"',
        '  description: "second"',
        "  misconceptions:",
        "    - id: mis.dup.example",
        "      skill: skill.dup.second",
        '      title: "B"',
        "      signature: { choice: b }",
        "      hintLadder: []",
        '      feedback: "b"',
        "",
      ].join("\n"),
    );
    expect(() => loadContent(dir)).toThrow(/duplicate misconception id/);
  });
});
