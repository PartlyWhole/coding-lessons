import type { MainThreadPyodide, PyodideLoader } from "../src/types.js";

export interface FakePyodide extends MainThreadPyodide {
  ops: string[];
  sources: string[];
  module: { keyboardListeningElement?: unknown };
}

// Ordered-op-log fake of the narrow main-thread Pyodide surface. `withCanvasApi: false`
// simulates a Pyodide build whose canvas API surface differs (§17.8 fallback path).
export function makeFakePyodide(opts: { withCanvasApi?: boolean } = {}): FakePyodide {
  const ops: string[] = [];
  const sources: string[] = [];
  const module: { keyboardListeningElement?: unknown } = {};
  const fake: FakePyodide = {
    ops,
    sources,
    module,
    ...(opts.withCanvasApi === false
      ? {}
      : {
          canvas: {
            setCanvas2D: () => {
              ops.push("setCanvas2D");
            },
          },
        }),
    loadPackage: async (name: string) => {
      ops.push(`loadPackage:${name}`);
    },
    runPythonAsync: async (code: string) => {
      ops.push("runPythonAsync");
      sources.push(code);
      return undefined;
    },
    FS: {
      mkdirTree: (path: string) => {
        ops.push(`mkdirTree:${path}`);
      },
      writeFile: (path: string) => {
        ops.push(`writeFile:${path}`);
      },
    },
    _module: module,
  };
  return fake;
}

export function makeLoader(fake: FakePyodide): {
  loader: PyodideLoader;
  calls: { indexURL: string }[];
} {
  const calls: { indexURL: string }[] = [];
  return {
    loader: async (o) => {
      calls.push(o);
      fake.ops.push("loadPyodide");
      return fake;
    },
    calls,
  };
}
