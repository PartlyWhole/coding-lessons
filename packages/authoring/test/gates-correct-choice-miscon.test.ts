import { describe, it, expect } from "vitest";
import { resolve } from "node:path";
import { loadContent } from "../src/load.js";
import { gateCorrectChoiceMiscon } from "../src/gates/correct-choice-miscon.js";
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

describe("gate 9: no misconception tag on a correct choice/answer", () => {
  it("has no errors on the real corpus; the four ESCALATED known findings surface as warns", () => {
    const issues = gateCorrectChoiceMiscon(loadContent(CONTENT));
    expect(issues.filter((i) => i.level === "error")).toEqual([]);
    // Real instances of the d8f20b3 bug class found by this gate on 2026-06-09 and
    // escalated to the orchestrator (content/** is orchestrator-owned). Pinned in the
    // gate's KNOWN_ESCALATED baseline; when content is fixed and the baseline emptied,
    // this assertion becomes toEqual([]).
    expect(issues.filter((i) => i.level === "warn").map((i) => i.message.split(":")[0]).sort()).toEqual([
      "cell.input.numbers#2",
      "cell.loops.guessing_game#2",
      "cell.variables.box#2",
      "cell.variables.use#2",
    ]);
  });

  // Golden mutation: the exact d8f20b3 bug — join_text#2 carried mis.concat.missing_space
  // on choice b, the CORRECT choice (b is in expected.normalized). The tag described the
  // label, not the belief that picks it.
  it("FAILS on the historical d8f20b3 bug: misconception on the correct predict choice", () => {
    const loaded = loadedWith([
      {
        id: "cell.string_concat.join_text#2",
        kind: "predict",
        choices: [
          { id: "a", label: "Hi Alan" },
          { id: "b", label: "HiAlan", misconception: "mis.concat.missing_space" },
          { id: "c", label: "Hi name" },
        ],
        expected: { normalized: ["b", "HiAlan"] },
      },
    ]);
    const issues = gateCorrectChoiceMiscon(loaded);
    expect(issues).toHaveLength(1);
    expect(issues[0]!.level).toBe("error");
    expect(issues[0]!.gate).toBe("9-correct-miscon");
    expect(issues[0]!.message).toContain("cell.string_concat.join_text#2");
    expect(issues[0]!.message).toContain('"b"');
    expect(issues[0]!.message).toContain("mis.concat.missing_space");
  });

  it("passes once the tag moves to a wrong choice (the d8f20b3 fix: b -> a)", () => {
    const loaded = loadedWith([
      {
        id: "cell.string_concat.join_text#2",
        kind: "predict",
        choices: [
          { id: "a", label: "Hi Alan", misconception: "mis.concat.missing_space" },
          { id: "b", label: "HiAlan" },
          { id: "c", label: "Hi name" },
        ],
        expected: { normalized: ["b", "HiAlan"] },
      },
    ]);
    expect(gateCorrectChoiceMiscon(loaded)).toEqual([]);
  });

  it("FAILS on a recognize step whose correctChoiceId choice carries a misconception", () => {
    const loaded = loadedWith([
      {
        id: "s#1",
        kind: "recognize",
        correctChoiceId: "a",
        choices: [
          { id: "a", label: "right", misconception: "mis.x" },
          { id: "b", label: "wrong" },
        ],
      },
    ]);
    const issues = gateCorrectChoiceMiscon(loaded);
    expect(issues).toHaveLength(1);
    expect(issues[0]!.message).toContain("s#1");
    expect(issues[0]!.message).toContain('"a"');
  });

  it("passes a recognize step with misconceptions only on wrong choices", () => {
    const loaded = loadedWith([
      {
        id: "s#1",
        kind: "recognize",
        correctChoiceId: "a",
        choices: [
          { id: "a", label: "right" },
          { id: "b", label: "wrong", misconception: "mis.x" },
        ],
      },
    ]);
    expect(gateCorrectChoiceMiscon(loaded)).toEqual([]);
  });

  // Text-mode analogue (same bug class): a misconceptionMap key that itself matches the
  // accepted answers is dead/contradictory — directMisconception only runs when correct=false.
  it("FAILS on a choice-mode predict expected.misconceptionMap keyed by a correct choice id", () => {
    const loaded = loadedWith([
      {
        id: "s#1",
        kind: "predict",
        choices: [{ id: "a", label: "x" }, { id: "b", label: "y" }],
        expected: { normalized: ["a"], misconceptionMap: { a: "mis.x" } },
      },
    ]);
    const issues = gateCorrectChoiceMiscon(loaded);
    expect(issues).toHaveLength(1);
    expect(issues[0]!.message).toContain("misconceptionMap");
  });

  it("FAILS on a recall accepted.misconceptionMap key that matches an accepted answer", () => {
    const loaded = loadedWith([
      {
        id: "s#1",
        kind: "recall",
        accepted: { normalized: ["print"], misconceptionMap: { print: "mis.x" } },
      },
    ]);
    expect(gateCorrectChoiceMiscon(loaded)).toHaveLength(1);
  });

  it("FAILS on a text-mode predict expected.misconceptionMap key matching expected", () => {
    const loaded = loadedWith([
      {
        id: "s#1",
        kind: "predict",
        expected: { normalized: ["7"], misconceptionMap: { "7": "mis.x" } },
      },
    ]);
    expect(gateCorrectChoiceMiscon(loaded)).toHaveLength(1);
  });

  it("passes misconceptionMap entries keyed by wrong answers", () => {
    const loaded = loadedWith([
      {
        id: "s#1",
        kind: "recall",
        accepted: { normalized: ["print"], misconceptionMap: { echo: "mis.x" } },
      },
      {
        id: "s#2",
        kind: "predict",
        choices: [{ id: "a", label: "x" }, { id: "b", label: "y" }],
        expected: { normalized: ["a"], misconceptionMap: { b: "mis.y" } },
      },
    ]);
    expect(gateCorrectChoiceMiscon(loaded)).toEqual([]);
  });
});
