import { describe, it, expect } from "vitest";
import { resolve } from "node:path";
import { loadContent } from "../src/load.js";
import { gateAnswerable } from "../src/gates/answerable.js";
import type { Loaded, RawStep } from "../src/raw-types.js";

const CONTENT = resolve(__dirname, "../../../content");

function loadedWith(steps: RawStep[]): Loaded {
  return {
    nodes: {
      n: {
        id: "n", title: "", track: "spine", requires: [], teaches: [],
        cells: [{ id: "c", title: "", steps }],
      },
    },
    skills: {},
    miscons: {},
  };
}

describe("gate 8: answerable choice-mode predicts", () => {
  it("passes on the real corpus", () => {
    const issues = gateAnswerable(loadContent(CONTENT));
    expect(issues).toEqual([]);
  });

  // Golden mutation: the exact 0884bf3 bug (cell.string_concat.join_text#2 as authored
  // pre-fix) — expected.normalized listed only the prose label, never a choice id, so the
  // engine (which compares the chosen CHOICE ID) could never pass the step.
  it("FAILS on the historical 0884bf3 bug: expected.normalized lacks any choice id", () => {
    const loaded = loadedWith([
      {
        id: "cell.string_concat.join_text#2",
        kind: "predict",
        choices: [
          { id: "a", label: "Hi Alan", misconception: "mis.concat.missing_space" },
          { id: "b", label: "HiAlan" },
          { id: "c", label: "Hi name" },
        ],
        expected: { normalized: ["HiAlan"] },
      },
    ]);
    const issues = gateAnswerable(loaded);
    expect(issues).toHaveLength(1);
    expect(issues[0]!.level).toBe("error");
    expect(issues[0]!.gate).toBe("8-answerable");
    expect(issues[0]!.message).toContain("cell.string_concat.join_text#2");
    expect(issues[0]!.message).toMatch(/choice id/i);
  });

  it("passes once the correct choice id is listed in expected.normalized (the 0884bf3 fix)", () => {
    const loaded = loadedWith([
      {
        id: "cell.string_concat.join_text#2",
        kind: "predict",
        choices: [
          { id: "a", label: "Hi Alan" },
          { id: "b", label: "HiAlan" },
          { id: "c", label: "Hi name" },
        ],
        expected: { normalized: ["b", "HiAlan"] },
      },
    ]);
    expect(gateAnswerable(loaded)).toEqual([]);
  });

  it("mirrors engine normalize: a normalized entry that differs only by case/whitespace matches", () => {
    const loaded = loadedWith([
      { id: "s#1", kind: "predict", choices: [{ id: "b", label: "x" }], expected: { normalized: ["  B "] } },
    ]);
    expect(gateAnswerable(loaded)).toEqual([]);
  });

  it("mirrors engine patterns: an anchored RE2 full-match on a choice id is answerable", () => {
    const loaded = loadedWith([
      { id: "s#1", kind: "predict", choices: [{ id: "b", label: "x" }], expected: { patterns: ["[ab]"] } },
    ]);
    expect(gateAnswerable(loaded)).toEqual([]);
  });

  it("a pattern that only partially matches a choice id does NOT make the step answerable (RE2 full match)", () => {
    const loaded = loadedWith([
      { id: "s#1", kind: "predict", choices: [{ id: "ab", label: "x" }], expected: { patterns: ["a"] } },
    ]);
    expect(gateAnswerable(loaded)).toHaveLength(1);
  });

  it("ignores text-mode predicts (no choices) and non-predict steps", () => {
    const loaded = loadedWith([
      { id: "s#1", kind: "predict", expected: { normalized: ["some text"] } },
      { id: "s#2", kind: "recognize", choices: [{ id: "a", label: "x" }], correctChoiceId: "a" },
      { id: "s#3", kind: "watch" },
    ]);
    expect(gateAnswerable(loaded)).toEqual([]);
  });
});
