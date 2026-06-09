import type { RunResult, AstQuery } from "@trellis/schema";
import { buildMatchProgram, MATCH_SENTINEL } from "./ast-query.js";

export type RunFn = (req: {
  code: string;
  entrypoint?: string;
  stdin?: string;
  timeoutMs: number;
  memoryMb: number;
}) => Promise<RunResult>;

// §6.3 parseAndMatch: run the AST interpreter program (which only ast.parse-s, never execs
// the learner code) and read the matched tags off stdout. Works against ANY frozen
// Sandbox.run (the Pyodide host or the offline CPython twin).
export async function parseAndMatch(
  run: RunFn,
  code: string,
  queries: { tag: string; query: AstQuery }[],
): Promise<string[]> {
  const program = buildMatchProgram(code, queries);
  const res = await run({ code: program, timeoutMs: 5000, memoryMb: 256 });
  if (!res.ran || res.error) return [];
  const idx = res.stdout.lastIndexOf(MATCH_SENTINEL);
  if (idx === -1) return [];
  try {
    return JSON.parse(res.stdout.slice(idx + MATCH_SENTINEL.length)) as string[];
  } catch {
    return [];
  }
}
