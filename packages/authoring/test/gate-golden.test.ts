import { describe, it, expect } from "vitest";
import { gateGolden } from "../src/gates/golden.js";
import type { Loaded } from "../src/raw-types.js";

// The real str_num build step + misconception, minimal but faithful to content/.
function loadedWithGolden(golden: unknown): Loaded {
  const step = {
    id: "cell.string_concat.text_plus_number#4",
    kind: "build",
    language: "python",
    skills: ["skill.string.concat_str_num"],
    starterCode: "def announce(number):\n    return \"\"",
    evaluator: {
      run: { timeoutMs: 5000, memoryMb: 256, entrypoint: "announce" },
      tests: { cases: [{ args: [7], expected: "Your random number is: 7" }] },
    },
    golden,
  };
  return {
    nodes: {
      "node.string_concat": {
        id: "node.string_concat",
        cells: [{ id: "cell.string_concat.text_plus_number", nodeId: "node.string_concat", title: "t", certifies: [], steps: [step] }],
      },
    },
    skills: {
      "skill.string.concat_str_num": { id: "skill.string.concat_str_num", title: "t", description: "", upstream: ["skill.string.concat"], misconceptions: [] },
    },
    miscons: {
      "mis.concat.str_num": {
        id: "mis.concat.str_num",
        skill: "skill.string.concat_str_num",
        title: "t",
        signature: { any: [{ runError: "runtime" }, { choice: "a" }] },
        hintLadder: [],
        feedback: "fb",
      },
    },
  } as unknown as Loaded;
}

describe("gate 7 — golden Diagnosis snapshots (live re-grade + diff)", () => {
  it("no goldens in corpus → informational warn, never red", () => {
    const loaded = loadedWithGolden(undefined);
    const issues = gateGolden(loaded);
    expect(issues.every((i) => i.level === "warn")).toBe(true);
  });

  it("a matching golden re-grades clean (no error)", () => {
    const loaded = loadedWithGolden({
      submission: "def announce(number):\n    return \"Your random number is: \" + number",
      expect: { attribution: "misconception", misconceptionId: "mis.concat.str_num" },
    });
    const issues = gateGolden(loaded);
    expect(issues.filter((i) => i.level === "error")).toEqual([]);
  });

  it("a golden whose expected attribution is wrong fails the gate with a clear diff", () => {
    const loaded = loadedWithGolden({
      submission: "def announce(number):\n    return \"Your random number is: \" + number",
      expect: { attribution: "pass" }, // wrong: this submission is a misconception
    });
    const issues = gateGolden(loaded);
    const errs = issues.filter((i) => i.level === "error");
    expect(errs.length).toBe(1);
    expect(errs[0]!.message).toContain("cell.string_concat.text_plus_number#4");
    expect(errs[0]!.message).toContain("attribution");
  });

  it("a golden whose expected misconceptionId is wrong fails the gate", () => {
    const loaded = loadedWithGolden({
      submission: "def announce(number):\n    return \"Your random number is: \" + number",
      expect: { attribution: "misconception", misconceptionId: "mis.concat.missing_space" },
    });
    const errs = gateGolden(loaded).filter((i) => i.level === "error");
    expect(errs.length).toBe(1);
    expect(errs[0]!.message).toContain("misconceptionId");
  });

  it("a malformed golden (missing expect) fails with a clear error, not a crash", () => {
    const loaded = loadedWithGolden({ submission: "def announce(number):\n    return number" });
    const errs = gateGolden(loaded).filter((i) => i.level === "error");
    expect(errs.length).toBe(1);
    expect(errs[0]!.message).toContain("malformed golden");
  });
});
