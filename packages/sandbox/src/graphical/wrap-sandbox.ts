import type { RunRequest, RunResult, AstQuery } from "@trellis/schema";
import type { SandboxRunRequest } from "../protocol.js";
import { APPENDIX_MARKER, HEADLESS_PREFIX } from "./compose.js";

// Structural twin of the engine's BuildSandbox ({ run, parseAndMatch }). The sandbox
// must NOT import the engine (adapter direction; the dev cycle was deliberately
// broken) — the decorator is shape-compatible by construction.
export interface BuildSandboxShape {
  run(req: RunRequest): Promise<RunResult>;
  parseAndMatch(
    code: string,
    queries: { tag: string; query: AstQuery }[],
  ): Promise<string[]>;
}

// D3 — the additive-seam decorator (precedent: BuildSandbox = Sandbox & parseAndMatch).
// Every run gets the one-line dummy-driver/TRELLIS_HEADLESS prefix and the lazy
// pygame-ce wire flag; error lines map back to learner coordinates; AST queries see
// the LEARNER source only (everything from APPENDIX_MARKER stripped).
export function wrapGraphicalSandbox(inner: BuildSandboxShape): BuildSandboxShape {
  return {
    async run(req: RunRequest): Promise<RunResult> {
      const wired: SandboxRunRequest = {
        ...req,
        code: HEADLESS_PREFIX + req.code,
        packages: ["pygame-ce"],
      };
      const res = await inner.run(wired as RunRequest);
      if (res.error?.line !== undefined && res.error.line > 1) {
        return { ...res, error: { ...res.error, line: res.error.line - 1 } };
      }
      return res;
    },
    parseAndMatch(code, queries) {
      const cut = code.indexOf(APPENDIX_MARKER);
      return inner.parseAndMatch(cut === -1 ? code : code.slice(0, cut), queries);
    },
  };
}
