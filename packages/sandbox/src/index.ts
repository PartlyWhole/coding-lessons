// @trellis/sandbox — Pyodide Web Worker grader host (M3a).
// Implements the frozen @trellis/schema `Sandbox` contract (§6.1).
export { createSandbox } from "./sandbox.js";
export type { SandboxConfig, ManagedSandbox } from "./sandbox.js";
export type { PoolStatus } from "./warm-pool.js";
export { realClock } from "./clock.js";
export type { Clock, Timer } from "./clock.js";
export type { WorkerLike, WorkerFactory, SandboxRunRequest } from "./protocol.js";
export { PYODIDE_VERSION, PINNED_PYODIDE_URL } from "./pinned.js";
// Production worker factory + entry. Real-Pyodide behavior is DEFERRED (needs network).
export { browserWorkerFactory } from "./browser-worker.js";
export { createLocalSandbox } from "./local-cpython.js";
export type { LocalSandbox, LocalSandboxConfig } from "./local-cpython.js";
export { parseAndMatch } from "./parse-and-match.js";
export type { RunFn } from "./parse-and-match.js";
export { AST_QUERY_INTERPRETER, buildMatchProgram, MATCH_SENTINEL } from "./ast-query.js";
export { RUN_HARNESS } from "./run-harness.js";
// M6.5 §17.5 — the graphical (pygame) headless-grading path.
export {
  composeHeadlessSource,
  composeReferenceSource,
  APPENDIX_MARKER,
  HEADLESS_PREFIX,
} from "./graphical/compose.js";
export { wrapGraphicalSandbox } from "./graphical/wrap-sandbox.js";
export type { BuildSandboxShape } from "./graphical/wrap-sandbox.js";
