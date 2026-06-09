import { createSandbox, browserWorkerFactory } from "@trellis/sandbox";
import type { BuildSandbox } from "@trellis/engine";

// Production sandbox: the Pyodide Web Worker host. Real-Pyodide-in-WASM behavior is DEFERRED
// to a networked browser (no network here). createSandbox returns a ManagedSandbox, which
// structurally satisfies BuildSandbox ({ run, parseAndMatch }).
//
// `browserWorkerFactory(workerUrl)` builds the WorkerFactory; the app supplies the worker URL,
// which the static host resolves against the served @trellis/sandbox dist (§6.1). Resolved at
// load time relative to this module so `python -m http.server` can serve it without a bundler.
const workerUrl = new URL(
  "../../../sandbox/dist/src/pyodide-worker.js",
  import.meta.url,
);

export function makeBrowserSandbox(): BuildSandbox {
  return createSandbox({ workerFactory: browserWorkerFactory(workerUrl) });
}
