import type { RunRequest, RunResult } from "@trellis/schema";
import type { Clock, Timer } from "./clock.js";
import {
  isInitErrorMessage,
  isReadyMessage,
  isResultMessage,
  type WorkerFactory,
  type WorkerLike,
  type WorkerToHost,
} from "./protocol.js";

export type HostState = "warming" | "ready" | "running" | "dead";

export interface WorkerHostConfig {
  memoryMb: number;
  pyodideUrl: string;
  clock: Clock;
  warmupTimeoutMs: number;
}

interface Pending {
  id: number;
  resolve: (r: RunResult) => void;
  reject: (e: Error) => void;
}

export class WorkerHost {
  private readonly worker: WorkerLike;
  private readonly clock: Clock;
  private state_: HostState = "warming";
  private nextId = 1;
  private pending: Pending | null = null;
  private readyResolve!: () => void;
  private readyReject!: (e: Error) => void;
  private readonly readyPromise: Promise<void>;
  private warmupTimer: Timer | null = null;

  constructor(factory: WorkerFactory, private readonly config: WorkerHostConfig) {
    this.clock = config.clock;
    this.worker = factory();
    this.worker.onmessage = (ev) => this.onMessage(ev.data);
    this.worker.onerror = (ev) => this.fail(new Error(`worker error: ${ev.message}`));
    this.readyPromise = new Promise<void>((resolve, reject) => {
      this.readyResolve = resolve;
      this.readyReject = reject;
    });
    // Catch warmup hangs: terminate and reject if not ready in time.
    this.warmupTimer = this.clock.setTimer(() => {
      if (this.state_ === "warming") this.fail(new Error("warmup timed out"));
    }, config.warmupTimeoutMs);
    this.worker.postMessage({
      kind: "init",
      memoryMb: config.memoryMb,
      pyodideUrl: config.pyodideUrl,
    });
  }

  get state(): HostState {
    return this.state_;
  }

  ready(): Promise<void> {
    return this.readyPromise;
  }

  run(req: RunRequest & { packages?: string[] }): Promise<RunResult> {
    if (this.state_ === "dead") return Promise.reject(new Error("worker is dead"));
    if (this.state_ !== "ready") return Promise.reject(new Error(`cannot run while ${this.state_}`));
    const id = this.nextId++;
    this.state_ = "running";
    return new Promise<RunResult>((resolve, reject) => {
      this.pending = { id, resolve, reject };
      this.worker.postMessage({
        kind: "run",
        id,
        req: {
          code: req.code,
          ...(req.entrypoint !== undefined ? { entrypoint: req.entrypoint } : {}),
          ...(req.stdin !== undefined ? { stdin: req.stdin } : {}),
          timeoutMs: req.timeoutMs,
          memoryMb: req.memoryMb,
          ...(req.packages !== undefined ? { packages: req.packages } : {}),
        },
      });
    });
  }

  terminate(): void {
    if (this.state_ === "dead") return;
    this.clearWarmup();
    this.state_ = "dead";
    this.worker.terminate();
    if (this.pending) {
      this.pending.reject(new Error("worker terminated"));
      this.pending = null;
    }
  }

  private clearWarmup(): void {
    if (this.warmupTimer !== null) {
      this.clock.clearTimer(this.warmupTimer);
      this.warmupTimer = null;
    }
  }

  private fail(err: Error): void {
    if (this.state_ === "dead") return;
    const wasWarming = this.state_ === "warming";
    this.clearWarmup();
    this.state_ = "dead";
    this.worker.terminate();
    if (wasWarming) this.readyReject(err);
    if (this.pending) {
      this.pending.reject(err);
      this.pending = null;
    }
  }

  private onMessage(msg: WorkerToHost): void {
    if (this.state_ === "dead") return;
    if (isReadyMessage(msg)) {
      this.clearWarmup();
      this.state_ = "ready";
      this.readyResolve();
      return;
    }
    if (isInitErrorMessage(msg)) {
      this.fail(new Error(msg.message));
      return;
    }
    if (isResultMessage(msg)) {
      if (this.pending && this.pending.id === msg.id) {
        const { resolve } = this.pending;
        this.pending = null;
        if (msg.recycle === true) {
          // The worker retired itself (e.g. mem-cap hit; the wasm heap cannot shrink).
          // Tear the Worker down and go dead BEFORE resolving, so the pool's
          // `host.state === "dead"` check discards us and spawns a replacement.
          this.state_ = "dead";
          this.worker.terminate();
        } else {
          this.state_ = "ready";
        }
        resolve(msg.result);
      }
    }
  }
}
