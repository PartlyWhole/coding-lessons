import { describe, it, expect } from "vitest";
import { Value } from "@sinclair/typebox/value";
import { RunResult } from "@trellis/schema";
import {
  isResultMessage,
  isReadyMessage,
  type WorkerToHost,
  type RunResultData,
} from "../src/protocol.js";

describe("protocol message guards", () => {
  it("discriminates ready and result messages", () => {
    const ready: WorkerToHost = { kind: "ready" };
    const result: WorkerToHost = {
      kind: "result",
      id: 1,
      result: { ran: true, stdout: "hi\n", wallMs: 3, timedOut: false },
    };
    expect(isReadyMessage(ready)).toBe(true);
    expect(isResultMessage(ready)).toBe(false);
    expect(isResultMessage(result)).toBe(true);
  });
});

describe("RunResult conformance to the frozen contract", () => {
  const samples: RunResultData[] = [
    { ran: true, stdout: "42\n", returnValue: 42, wallMs: 5, timedOut: false },
    { ran: false, stdout: "", wallMs: 0, timedOut: true },
    { ran: false, stdout: "", wallMs: 1, timedOut: false,
      error: { type: "syntax", message: "invalid syntax", line: 2 } },
    { ran: true, stdout: "partial", wallMs: 2, timedOut: false,
      error: { type: "runtime", message: "ZeroDivisionError: division by zero", line: 3 } },
  ];
  it("every host-built RunResult passes Value.Check against @trellis/schema", () => {
    for (const s of samples) {
      expect(Value.Check(RunResult, s)).toBe(true);
    }
  });
});
