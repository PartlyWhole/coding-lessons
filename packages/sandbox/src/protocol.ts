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
}

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
export interface ResultMessage { kind: "result"; id: number; result: RunResultData; }
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
