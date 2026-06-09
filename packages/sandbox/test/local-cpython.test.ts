import { describe, it, expect } from "vitest";
import { createLocalSandbox } from "../src/local-cpython.js";

const sb = createLocalSandbox();

describe("createLocalSandbox.run", () => {
  it("runs a top-level program and captures stdout", async () => {
    const r = await sb.run({ code: "print('hello')", timeoutMs: 5000, memoryMb: 256 });
    expect(r.ran).toBe(true);
    expect(r.stdout).toBe("hello\n");
    expect(r.error).toBeUndefined();
  });
  it("classifies a syntax error (ran=false, type=syntax)", async () => {
    const r = await sb.run({ code: "def f(:\n    pass", timeoutMs: 5000, memoryMb: 256 });
    expect(r.ran).toBe(false);
    expect(r.error?.type).toBe("syntax");
  });
  it("classifies a runtime error (ran=true, type=runtime)", async () => {
    const r = await sb.run({ code: "print(undefined_name)", timeoutMs: 5000, memoryMb: 256 });
    expect(r.ran).toBe(true);
    expect(r.error?.type).toBe("runtime");
  });
  it("feeds stdin to a program", async () => {
    const r = await sb.run({ code: "print('Hi ' + input() + '!')", stdin: "Alan\n", timeoutMs: 5000, memoryMb: 256 });
    expect(r.stdout).toBe("Hi Alan!\n");
  });
  it("calls an entrypoint() with no args and returns its value", async () => {
    const r = await sb.run({ code: "def main():\n    return 7", entrypoint: "main", timeoutMs: 5000, memoryMb: 256 });
    expect(r.returnValue).toBe(7);
  });
  it("times out a non-terminating program", async () => {
    const r = await sb.run({ code: "while True:\n    pass", timeoutMs: 1000, memoryMb: 256 });
    expect(r.timedOut).toBe(true);
    expect(r.ran).toBe(false);
  });
  it("wallMs is deterministic (0), so Diagnoses stay reproducible", async () => {
    const a = await sb.run({ code: "print('x')", timeoutMs: 5000, memoryMb: 256 });
    const b = await sb.run({ code: "print('x')", timeoutMs: 5000, memoryMb: 256 });
    expect(a.wallMs).toBe(b.wallMs);
  });
});

describe("createLocalSandbox.parseAndMatch", () => {
  it("matches a field-scoped elif (has_elif) but NOT a nested-if-in-body", async () => {
    const q = [{ tag: "has_elif", query: { node: "If", field: { orelse: { node: "If" } } } }];
    const elif = "def g(s):\n    if s >= 90:\n        return 'A'\n    elif s >= 80:\n        return 'B'\n    else:\n        return 'C'";
    const nestedIf = "def g(s):\n    if s >= 90:\n        if s >= 95:\n            return 'A'\n    return 'C'";
    expect(await sb.parseAndMatch(elif, q)).toContain("has_elif");
    expect(await sb.parseAndMatch(nestedIf, q)).not.toContain("has_elif");
  });
  it("returns [] on a syntax error", async () => {
    const q = [{ tag: "t", query: { node: "Return" } }];
    expect(await sb.parseAndMatch("def f(:", q)).toEqual([]);
  });
});
