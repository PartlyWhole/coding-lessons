import { describe, it, expect } from "vitest";
import type { BuildStep, RunResult, RunRequest, Json } from "@trellis/schema";
import { runTests } from "../src/testRunner.js";
import { SENTINEL } from "../src/pyDriver.js";

// Extract the args the driver embedded: it contains `b64decode("<base64 of JSON args>")`.
function decodeDriverArgs(code: string): Json[] {
  const m = code.match(/b64decode\("([^"]+)"\)/);
  if (!m) return [];
  return JSON.parse(atob(m[1]!)) as Json[];
}

// A scripted fake BuildSandbox.
function fakeSandbox(handler: (req: RunRequest) => RunResult) {
  return {
    run: async (req: RunRequest): Promise<RunResult> => handler(req),
    parseAndMatch: async (): Promise<string[]> => [],
  };
}

const greetStep = {
  kind: "build",
  evaluator: {
    run: { timeoutMs: 2000, memoryMb: 256, entrypoint: "greet" },
    tests: { comparator: "deep-equal", cases: [
      { input: "Alan", expected: "Hi Alan!" },
      { input: "Bo", expected: "Hi Bo!" },
    ] },
  },
} as unknown as BuildStep;

const result = (over: Partial<RunResult>): RunResult =>
  ({ ran: true, stdout: "", wallMs: 1, timedOut: false, ...over });

describe("runTests - entrypoint style", () => {
  it("passes when every case returns the expected value", async () => {
    // Emulate greet(name) by decoding the embedded args.
    const sb = fakeSandbox((req) => {
      const [name] = decodeDriverArgs(req.code) as [string];
      return result({ stdout: SENTINEL + JSON.stringify({ v: `Hi ${name}!` }) });
    });
    const r = await runTests(greetStep, "def greet(name):\n    return 'Hi ' + name + '!'", sb);
    expect(r.passed).toBe(2);
    expect(r.failed).toBe(0);
    expect(r.runError).toBeUndefined();
  });

  it("a per-case runtime error sets runError and fails that case", async () => {
    const sb = fakeSandbox(() => result({ ran: true, error: { type: "runtime", message: "NameError" } }));
    const r = await runTests(greetStep, "def greet(name):\n    return missing", sb);
    expect(r.runError?.type).toBe("runtime");
    expect(r.failed).toBeGreaterThan(0);
  });

  it("a wrong value fails the case without a runError", async () => {
    const sb = fakeSandbox(() => result({ stdout: SENTINEL + JSON.stringify({ v: "WRONG" }) }));
    const r = await runTests(greetStep, "def greet(name):\n    return 'WRONG'", sb);
    expect(r.failed).toBe(2);
    expect(r.runError).toBeUndefined();
    expect(r.failures[0]).toEqual({ caseIndex: 0, got: "WRONG" });
  });
});

describe("runTests - stdin style", () => {
  const stdinStep = {
    kind: "build",
    evaluator: {
      run: { timeoutMs: 2000, memoryMb: 256 },
      tests: { comparator: "deep-equal", cases: [{ input: "Alan\n", expected: "Hi Alan!\n" }] },
    },
  } as unknown as BuildStep;

  it("compares stdout to expected", async () => {
    const sb = fakeSandbox((req) => result({ stdout: req.stdin === "Alan\n" ? "Hi Alan!\n" : "?" }));
    const r = await runTests(stdinStep, "print('Hi ' + input() + '!')", sb);
    expect(r.passed).toBe(1);
    expect(r.failed).toBe(0);
  });
});
