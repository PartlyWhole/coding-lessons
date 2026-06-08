// @trellis/sandbox — Pyodide Web Worker grader host (M3a).
// Implements the frozen @trellis/schema `Sandbox` contract (§6.1).
export { createSandbox } from "./sandbox.js";
export type { SandboxConfig, ManagedSandbox } from "./sandbox.js";
export type { PoolStatus } from "./warm-pool.js";
export { realClock } from "./clock.js";
export type { Clock, Timer } from "./clock.js";
export type { WorkerLike, WorkerFactory } from "./protocol.js";
export { PYODIDE_VERSION, PINNED_PYODIDE_URL } from "./pinned.js";
