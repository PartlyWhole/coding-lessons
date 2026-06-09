import { createSandbox, browserWorkerFactory, type ManagedSandbox } from "@trellis/sandbox";

// Production sandbox: the Pyodide Web Worker host. createSandbox returns a ManagedSandbox
// (structurally a BuildSandbox: { run, parseAndMatch }) plus warmup()/status() — TrellisApp
// uses warmup() to drive the "Getting Python ready…" state.
//
// `browserWorkerFactory(workerUrl)` builds the WorkerFactory. The worker is bundled by
// scripts/build-app.mjs as a SIBLING module file of this bundle (dist/app/pyodide-worker.js),
// so resolving against import.meta.url works in the built, statically served layout
// (`python -m http.server` — Debt-5 defect 3 fix).
const workerUrl = new URL("./pyodide-worker.js", import.meta.url);

export function makeBrowserSandbox(): ManagedSandbox {
  return createSandbox({ workerFactory: browserWorkerFactory(workerUrl) });
}
