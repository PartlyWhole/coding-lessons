import { describe, it, expect } from "vitest";
import { validate } from "../src/validate.js";
import { ConceptNode, Cell, Misconception, Skill } from "../src/content.js";

describe("ConceptNode", () => {
  it("accepts the §13.1 string-concat node with three requirement kinds", () => {
    const node = {
      id: "node.string_concat",
      title: "String concatenation",
      track: "extension",
      requires: [
        { skill: "skill.var.assign", minMastery: 0.6, kind: "track" },
        { skill: "skill.string.literal", minMastery: 0.6, kind: "prerequisite" },
        { skill: "skill.var.use", minMastery: 0.6, kind: "utility" },
      ],
      teaches: ["skill.string.concat_str_num"],
      cells: ["cell.concat.intro"],
    };
    expect(validate(ConceptNode, node).ok).toBe(true);
  });

  it("rejects an unknown requirement kind", () => {
    const node = {
      id: "node.x",
      title: "x",
      track: "spine",
      requires: [{ skill: "s", minMastery: 0.5, kind: "bogus" }],
      teaches: [],
      cells: [],
    };
    expect(validate(ConceptNode, node).ok).toBe(false);
  });
});

describe("Cell with a Step union", () => {
  it("accepts a cell containing watch, predict, and build steps", () => {
    const cell = {
      id: "cell.concat.intro",
      nodeId: "node.string_concat",
      title: "Intro",
      certifies: ["skill.string.concat_str_num"],
      steps: [
        { id: "cell.concat.intro#0", kind: "watch", prompt: "p", skills: [], body: "Strings join with +" },
        {
          id: "cell.concat.intro#1",
          kind: "predict",
          prompt: "What prints?",
          skills: ["skill.string.concat_str_num"],
          code: "x = 'age: ' + 7",
          expected: { normalized: ["TypeError"] },
          reveal: "run-and-show",
        },
        {
          id: "cell.concat.intro#2",
          kind: "build",
          prompt: "Print 'age: 7'.",
          skills: ["skill.string.concat_str_num"],
          language: "python",
          starterCode: "age = 7\n# print here\n",
          evaluator: { run: { timeoutMs: 2000, memoryMb: 256 } },
        },
      ],
    };
    expect(validate(Cell, cell).ok).toBe(true);
  });

  it("rejects a build step missing its evaluator", () => {
    const cell = {
      id: "c",
      nodeId: "n",
      title: "t",
      certifies: [],
      steps: [
        { id: "c#0", kind: "build", prompt: "p", skills: [], language: "python", starterCode: "" },
      ],
    };
    expect(validate(Cell, cell).ok).toBe(false);
  });
});

describe("Misconception", () => {
  it("accepts the §13.1 implicit_coercion taxonomy entry", () => {
    const m: unknown = {
      id: "mis.concat.implicit_coercion",
      skill: "skill.string.concat_str_num",
      title: "Implicit coercion",
      signature: { any: [{ runError: "runtime" }, { astTag: "implicit_coerce" }] },
      feedback: "Python won't auto-convert a number to text.",
      hintLadder: [
        { level: 1, body: "What type is `age`?" },
        { level: 4, body: "Solution:", revealCode: "print(f'age: {age}')" },
      ],
      skillDeltas: [
        { skill: "skill.string.concat_str_num", kind: "misconception", weight: 0.3 },
      ],
    };
    expect(validate(Misconception, m).ok).toBe(true);
  });
});

describe("Skill", () => {
  it("accepts a skill with misconception ids and upstream edges", () => {
    const s = {
      id: "skill.string.concat_str_num",
      title: "Join a string and a number",
      description: "Combine text and a number into one string.",
      misconceptions: ["mis.concat.implicit_coercion"],
      upstream: ["skill.string.literal"],
    };
    expect(validate(Skill, s).ok).toBe(true);
  });
});
