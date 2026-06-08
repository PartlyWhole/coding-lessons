import { describe, it, expect } from "vitest";
import { sigMatch, norm, sigKinds, sigTags } from "../src/signature.js";

describe("sigMatch", () => {
  it("astTag", () => {
    expect(sigMatch({ astTag: "no_print_call" }, { astTags: new Set(["no_print_call"]) })).toBe(true);
    expect(sigMatch({ astTag: "x" }, { astTags: new Set() })).toBe(false);
  });
  it("runError", () => {
    expect(sigMatch({ runError: "runtime" }, { runError: { type: "runtime" } })).toBe(true);
    expect(sigMatch({ runError: "runtime" }, { runError: { type: "syntax" } })).toBe(false);
    expect(sigMatch({ runError: "runtime" }, {})).toBe(false);
  });
  it("timedOut (frozen primitive, new)", () => {
    expect(sigMatch({ timedOut: true }, { timedOut: true })).toBe(true);
    expect(sigMatch({ timedOut: true }, { timedOut: false })).toBe(false);
    expect(sigMatch({ timedOut: true }, {})).toBe(false);
  });
  it("testFailure with and without caseIndex", () => {
    expect(sigMatch({ testFailure: {} }, { tests: { failed: 1, failures: [0] } })).toBe(true);
    expect(sigMatch({ testFailure: { caseIndex: 0 } }, { tests: { failed: 1, failures: [0] } })).toBe(true);
    expect(sigMatch({ testFailure: { caseIndex: 1 } }, { tests: { failed: 1, failures: [0] } })).toBe(false);
    expect(sigMatch({ testFailure: {} }, { tests: { failed: 0, failures: [] } })).toBe(false);
  });
  it("choice / recallEquals (normalized)", () => {
    expect(sigMatch({ choice: "b" }, { chosenChoiceId: "b" })).toBe(true);
    expect(sigMatch({ recallEquals: "Int." }, { recallInput: " int " })).toBe(true);
  });
  it("all / any / not", () => {
    expect(sigMatch({ all: [{ astTag: "t" }, { choice: "b" }] }, { astTags: new Set(["t"]), chosenChoiceId: "b" })).toBe(true);
    expect(sigMatch({ any: [{ astTag: "t" }, { choice: "b" }] }, { chosenChoiceId: "b" })).toBe(true);
    expect(sigMatch({ not: { astTag: "t" } }, { astTags: new Set() })).toBe(true);
  });
  it("norm collapses whitespace, lowercases, strips a trailing period (byte-identical to harness)", () => {
    // harness norm("  Int .  "): strip->"Int .", split/join->"Int .", lower->"int .",
    // endswith "." -> s[:-1] -> "int " (a trailing space remains; this matches harness exactly).
    expect(norm("  Int .  ")).toBe("int ");
    expect(norm("A  B")).toBe("a b");
    expect(norm("Int.")).toBe("int");
    expect(norm(" int ")).toBe("int");
    expect(norm("")).toBe("");
  });
  it("sigKinds / sigTags collect referenced kinds and astTags", () => {
    const s = { any: [{ astTag: "no_print_call" }, { choice: "c" }] };
    expect([...sigKinds(s)].sort()).toEqual(["astTag", "choice"]);
    expect([...sigTags(s)]).toEqual(["no_print_call"]);
  });
});
