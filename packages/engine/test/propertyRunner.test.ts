import { describe, it, expect } from "vitest";
import type { PropertyConfig, RunRequest, RunResult, Json } from "@trellis/schema";
import { runProperty } from "../src/propertyRunner.js";
import { SENTINEL } from "../src/pyDriver.js";

// A fake sandbox that "runs" Python by recognizing our two entrypoints and computing the
// result in JS from the decoded args (read back out of the base64 the driver embeds).
function jsFakeSandbox(impl: (entry: "learner" | "oracle", args: number[]) => number) {
  return {
    parseAndMatch: async (): Promise<string[]> => [],
    run: async (req: RunRequest): Promise<RunResult> => {
      const entry: "learner" | "oracle" = req.code.includes("def sol") ? "oracle" : "learner";
      const m = req.code.match(/b64decode\("([^"]+)"\)/);
      const args = m ? (JSON.parse(atob(m[1]!)) as number[]) : [];
      const v = impl(entry, args);
      return { ran: true, stdout: SENTINEL + JSON.stringify({ v }), wallMs: 1, timedOut: false };
    },
  };
}

const prop: PropertyConfig = {
  referenceImpl: "def sol(a, b):\n    return a + b",
  generators: [
    { param: "a", type: "int", min: 0, max: 50 },
    { param: "b", type: "int", min: 0, max: 50 },
  ],
  numCases: 30,
  seed: 1234,
  comparator: "deep-equal",
};

describe("runProperty", () => {
  it("passes when learner matches the oracle on every case", async () => {
    const sb = jsFakeSandbox((_e, [a, b]) => a! + b!);
    const r = await runProperty(prop, "add", "def add(a, b):\n    return a + b", sb);
    expect(r.passed).toBe(true);
    expect(r.counterexample).toBeUndefined();
  });

  it("fails and returns a counterexample when learner diverges", async () => {
    const sb = jsFakeSandbox((e, [a, b]) => (e === "oracle" ? a! + b! : a! * b!));
    const r = await runProperty(prop, "add", "def add(a, b):\n    return a * b", sb);
    expect(r.passed).toBe(false);
    expect(Array.isArray(r.counterexample)).toBe(true);
  });

  it("is deterministic: identical counterexample for the same seed", async () => {
    const make = () => jsFakeSandbox((e, [a, b]) => (e === "oracle" ? a! + b! : a! * b!));
    const r1 = await runProperty(prop, "add", "def add(a, b):\n    return a * b", make());
    const r2 = await runProperty(prop, "add", "def add(a, b):\n    return a * b", make());
    expect(r1.counterexample).toEqual(r2.counterexample);
  });
});
