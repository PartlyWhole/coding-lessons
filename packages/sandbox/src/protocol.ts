import type { RunResult, RunRequest } from "@trellis/schema";

// RunResult is the frozen contract type (the worker emits it; the host re-stamps wallMs).
export type RunResultData = RunResult;

// Structured-clone-safe subset of RunRequest that crosses to the worker.
export interface WireRunRequest {
  code: string;
  entrypoint?: string;
  stdin?: string;
  timeoutMs: number;
  memoryMb: number;
  // M6.5 §17.5 additive wire field (host→worker mirror of the `recycle` precedent):
  // Pyodide package names to lazy-load before this run (e.g. ["pygame-ce"]). The
  // worker caches loaded names, so warm-pool reuse never re-downloads. Absent on
  // every non-graphical run — the frozen default path is byte-identical.
  packages?: string[];
}

// The structurally wider request callers may pass to a sandbox `run`. The frozen
// schema RunRequest is untouched; `packages` is sandbox-internal.
export type SandboxRunRequest = RunRequest & { packages?: string[] };

// ---- host → worker ----
export interface InitMessage {
  kind: "init";
  memoryMb: number;
  pyodideUrl: string;
}
export interface RunMessage {
  kind: "run";
  id: number;
  req: WireRunRequest;
}
export type HostToWorker = InitMessage | RunMessage;

// ---- worker → host ----
export interface ReadyMessage { kind: "ready"; }
export interface InitErrorMessage { kind: "init-error"; message: string; }
export interface ResultMessage {
  kind: "result";
  id: number;
  result: RunResultData;
  // Internal wire flag (NOT part of the frozen RunResult): the worker asks to be
  // retired after this result — e.g. it hit/neared the memoryMb cap and the wasm heap
  // cannot shrink. The host resolves the run, then goes dead so the pool discards it
  // and spawns a fresh replacement (same self-healing path as the watchdog).
  recycle?: boolean;
}
export type WorkerToHost = ReadyMessage | InitErrorMessage | ResultMessage;

export const isReadyMessage = (m: WorkerToHost): m is ReadyMessage => m.kind === "ready";
export const isInitErrorMessage = (m: WorkerToHost): m is InitErrorMessage =>
  m.kind === "init-error";
export const isResultMessage = (m: WorkerToHost): m is ResultMessage => m.kind === "result";

// The browser `Worker` shape, narrowed to what the host uses. The mock implements this.
export interface WorkerLike {
  postMessage(msg: HostToWorker): void;
  terminate(): void;
  onmessage: ((ev: { data: WorkerToHost }) => void) | null;
  onerror: ((ev: { message: string }) => void) | null;
}

export type WorkerFactory = () => WorkerLike;

// Re-export for convenience at the package boundary.
export type { RunRequest };
