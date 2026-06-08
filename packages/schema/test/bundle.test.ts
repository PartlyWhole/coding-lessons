import { describe, it, expect } from "vitest";
import { validate } from "../src/validate.js";
import { Bundle, Graph, RunResult } from "../src/bundle.js";

describe("Bundle", () => {
  it("accepts a minimal compiled bundle with derived indexes", () => {
    const b = {
      contentVersion: "2026.06.0",
      skills: {
        "skill.output.print_literal": {
          id: "skill.output.print_literal",
          title: "Print a literal",
          description: "Print fixed text.",
          misconceptions: ["mis.print.no_call"],
          upstream: [],
        },
      },
      nodes: {
        "node.output": {
          id: "node.output",
          title: "Output",
          track: "spine",
          requires: [],
          teaches: ["skill.output.print_literal"],
          cells: ["cell.output.hello"],
        },
      },
      cells: {
        "cell.output.hello": {
          id: "cell.output.hello",
          nodeId: "node.output",
          title: "Hello",
          certifies: ["skill.output.print_literal"],
          steps: [
            { id: "cell.output.hello#0", kind: "watch", prompt: "p", skills: [], body: "print(...)" },
          ],
        },
      },
      misconceptions: {
        "mis.print.no_call": {
          id: "mis.print.no_call",
          skill: "skill.output.print_literal",
          title: "No print call",
          signature: { not: { astTag: "has_print" } },
          hintLadder: [{ level: 1, body: "Did you call print()?" }],
          feedback: "Use print(...).",
        },
      },
      producers: { "skill.output.print_literal": ["node.output"] },
      requirements: { "node.output": [] },
    };
    expect(validate(Bundle, b).ok).toBe(true);
  });

  it("rejects a bundle missing its derived indexes", () => {
    const b = { contentVersion: "2026.06.0", skills: {}, nodes: {}, cells: {}, misconceptions: {} };
    expect(validate(Bundle, b).ok).toBe(false);
  });
});

describe("Graph", () => {
  it("accepts the resolver's structural subset", () => {
    const g = {
      nodes: {
        "node.string_concat": {
          id: "node.string_concat",
          title: "String concat",
          track: "spine",
          requires: [{ skill: "skill.string.literal", minMastery: 0.6, kind: "prerequisite" }],
          teaches: ["skill.string.concat"],
          cells: [],
        },
      },
      producers: { "skill.string.literal": ["node.variables"] },
      requirements: { "node.string_concat": [{ skill: "skill.string.literal", minMastery: 0.6, kind: "prerequisite" }] },
    };
    expect(validate(Graph, g).ok).toBe(true);
  });
});

describe("RunResult", () => {
  it("accepts a successful run", () => {
    const r = { ran: true, stdout: "age: 7\n", returnValue: null, wallMs: 42, timedOut: false };
    expect(validate(RunResult, r).ok).toBe(true);
  });

  it("accepts a watchdog timeout", () => {
    const r = { ran: false, stdout: "", wallMs: 2000, timedOut: true };
    expect(validate(RunResult, r).ok).toBe(true);
  });
});
