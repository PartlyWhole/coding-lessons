import { describe, it, expect } from "vitest";
import type { RunRequest, RunResult, AstQuery } from "@trellis/schema";
import { wrapGraphicalSandbox } from "../../src/graphical/wrap-sandbox.js";
import { APPENDIX_MARKER, HEADLESS_PREFIX } from "../../src/graphical/compose.js";

interface Recorded {
  runs: (RunRequest & { packages?: string[] })[];
  parses: { code: string; queries: unknown }[];
}

function recordingInner(result?: Partial<RunResult>): {
  inner: Parameters<typeof wrapGraphicalSandbox>[0];
  rec: Recorded;
} {
  const rec: Recorded = { runs: [], parses: [] };
  return {
    rec,
    inner: {
      async run(req) {
        rec.runs.push(req as RunRequest & { packages?: string[] });
        return {
          ran: true,
          stdout: "",
          wallMs: 1,
          timedOut: false,
          ...result,
        } as RunResult;
      },
      async parseAndMatch(code, queries) {
        rec.parses.push({ code, queries });
        return [];
      },
    },
  };
}

const q: { tag: string; query: AstQuery }[] = [{ tag: "t", query: { node: "Return" } }];

describe("wrapGraphicalSandbox (D3)", () => {
  it("run prefixes HEADLESS_PREFIX (exactly one line) and sets packages: [pygame-ce]", async () => {
    const { inner, rec } = recordingInner();
    const w = wrapGraphicalSandbox(inner);
    await w.run({ code: "x = 1", timeoutMs: 1000, memoryMb: 256 });
    expect(rec.runs[0]!.code).toBe(HEADLESS_PREFIX + "x = 1");
    expect(rec.runs[0]!.packages).toEqual(["pygame-ce"]);
    expect(HEADLESS_PREFIX.trimEnd().split("\n").length).toBe(1);
  });

  it("re-maps error.line by -1 (prefix is one line; learner line numbers preserved)", async () => {
    const { inner } = recordingInner({
      ran: false,
      error: { type: "syntax", message: "bad", line: 5 },
    });
    const w = wrapGraphicalSandbox(inner);
    const res = await w.run({ code: "x", timeoutMs: 1000, memoryMb: 256 });
    expect(res.error?.line).toBe(4);
  });

  it("leaves error untouched when line is absent, and never maps line 1 below 1", async () => {
    const { inner } = recordingInner({ ran: false, error: { type: "runtime", message: "boom" } });
    const w = wrapGraphicalSandbox(inner);
    const res = await w.run({ code: "x", timeoutMs: 1000, memoryMb: 256 });
    expect(res.error).toEqual({ type: "runtime", message: "boom" });

    const { inner: inner2 } = recordingInner({
      ran: false,
      error: { type: "syntax", message: "prefix-line fault", line: 1 },
    });
    const res2 = await wrapGraphicalSandbox(inner2).run({ code: "x", timeoutMs: 1000, memoryMb: 256 });
    expect(res2.error?.line).toBe(1);
  });

  it("parseAndMatch strips everything from APPENDIX_MARKER — AST over LEARNER source only", async () => {
    const { inner, rec } = recordingInner();
    const w = wrapGraphicalSandbox(inner);
    const composed = "def update():\n    pass\n\n" + APPENDIX_MARKER + "\nK_LEFT = 1\n";
    await w.parseAndMatch(composed, q);
    expect(rec.parses[0]!.code).toBe("def update():\n    pass\n\n");
    expect(rec.parses[0]!.code).not.toContain("K_LEFT");
  });

  it("parseAndMatch passes unmarked code through untouched", async () => {
    const { inner, rec } = recordingInner();
    const w = wrapGraphicalSandbox(inner);
    await w.parseAndMatch("plain", q);
    expect(rec.parses[0]!.code).toBe("plain");
    expect(rec.parses[0]!.queries).toBe(q);
  });
});
