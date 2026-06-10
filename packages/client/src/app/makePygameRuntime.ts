import {
  createPygameRuntime,
  type PygameRuntime,
  type MainThreadPyodide,
  type StallEvent,
} from "@trellis/runtime";
import { PINNED_PYODIDE_URL } from "@trellis/sandbox";
import type { AstQuery } from "@trellis/schema";

// The main-thread Pyodide module loader is INJECTED so tests never touch the network.
// Production default: dynamic import of the pinned CDN ESM build — the same single
// pin the grading worker uses (PINNED_PYODIDE_URL). The import happens lazily inside
// boot(), which only ever runs when a pygame step mounts (§17.7: the headless boot
// path pays nothing).
export interface PyodideModuleLike {
  loadPyodide(opts: { indexURL: string }): Promise<unknown>;
}
export type PyodideImporter = (specifier: string) => Promise<PyodideModuleLike>;

export interface MakePygameRuntimeOpts {
  importer?: PyodideImporter;
  genTarget?: Record<string, unknown>;
  onStall?: (e: StallEvent) => void;
}

export interface SandboxParseAndMatch {
  parseAndMatch(
    code: string,
    queries: { tag: string; query: AstQuery }[],
  ): Promise<string[]>;
}

export function makePygameRuntime(
  sandbox: SandboxParseAndMatch,
  opts: MakePygameRuntimeOpts = {},
): PygameRuntime {
  const importer: PyodideImporter =
    opts.importer ?? ((spec) => import(/* @vite-ignore */ spec) as Promise<PyodideModuleLike>);
  return createPygameRuntime({
    loadPyodide: async (o) => {
      const mod = await importer(`${o.indexURL}pyodide.mjs`);
      return (await mod.loadPyodide({ indexURL: o.indexURL })) as MainThreadPyodide;
    },
    // The precheck parses OFF the main thread, in the grading worker (§17.5 guard 1).
    parseAndMatch: (code, q) => sandbox.parseAndMatch(code, q),
    ...(opts.genTarget !== undefined ? { genTarget: opts.genTarget } : {}),
    ...(opts.onStall !== undefined ? { onStall: opts.onStall } : {}),
  });
}
