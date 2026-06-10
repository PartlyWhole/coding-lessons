import type { MainThreadPyodide, PyodideLoader, PyDictProxy } from "../src/types.js";

export interface FakeDictProxy extends PyDictProxy {
  destroyed: boolean;
  destroy(): void;
}

export interface FakePyodide extends MainThreadPyodide {
  ops: string[];
  sources: string[];
  /** opts.globals captured per runPythonAsync call (undefined when none was passed). */
  runGlobals: (PyDictProxy | undefined)[];
  /** every dict minted via toPy, in order. */
  minted: FakeDictProxy[];
  module: { keyboardListeningElement?: unknown };
}

// Ordered-op-log fake of the narrow main-thread Pyodide surface. `withCanvasApi: false`
// simulates a Pyodide build whose canvas API surface differs (§17.8 fallback path).
export function makeFakePyodide(opts: { withCanvasApi?: boolean } = {}): FakePyodide {
  const ops: string[] = [];
  const sources: string[] = [];
  const runGlobals: (PyDictProxy | undefined)[] = [];
  const minted: FakeDictProxy[] = [];
  const module: { keyboardListeningElement?: unknown } = {};
  const fake: FakePyodide = {
    ops,
    sources,
    runGlobals,
    minted,
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
    runPythonAsync: async (code: string, opts?: { globals?: PyDictProxy }) => {
      ops.push("runPythonAsync");
      sources.push(code);
      runGlobals.push(opts?.globals);
      return undefined;
    },
    // deliberately NOT pushed to ops: boot/run op-order tests stay about the real steps
    toPy: (_obj: Record<string, unknown>) => {
      const proxy: FakeDictProxy = {
        destroyed: false,
        destroy() {
          proxy.destroyed = true;
        },
      };
      minted.push(proxy);
      return proxy;
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
