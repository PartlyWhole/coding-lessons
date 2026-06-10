// @trellis/sandbox — BROWSER entry: the Pyodide Web Worker grader host without the
// node-only local-CPython twin. This graph must contain ZERO node builtins so a
// bundler targeting the browser never sees node:child_process (Debt-5 defect 2).
// Node consumers (the `default` exports condition) keep the full barrel in index.ts.
export { createSandbox } from "./sandbox.js";
export type { SandboxConfig, ManagedSandbox } from "./sandbox.js";
export type { PoolStatus } from "./warm-pool.js";
export { realClock } from "./clock.js";
export type { Clock, Timer } from "./clock.js";
export type { WorkerLike, WorkerFactory, SandboxRunRequest } from "./protocol.js";
export { PYODIDE_VERSION, PINNED_PYODIDE_URL } from "./pinned.js";
export { browserWorkerFactory } from "./browser-worker.js";
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
export { toHeadlessStep, composeSubmission } from "./graphical/transform-step.js";
