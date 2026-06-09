import type { Sandbox, RunResult, AstQuery } from "@trellis/schema";

// The §15 LanguageAnalyzer seam, realized WITHOUT touching the frozen schema. The
// engine depends only on this structural shape; the @trellis/sandbox package wires a
// concrete `parseAndMatch` onto the object it injects (Pyodide host or offline twin).
// `run` is exactly the frozen Sandbox.run.
export interface BuildSandbox extends Sandbox {
  parseAndMatch(code: string, queries: { tag: string; query: AstQuery }[]): Promise<string[]>;
}

// The learner's submission for a build step is its source code.
export interface BuildSubmission {
  kind: "build";
  code: string;
}

export type { RunResult };
