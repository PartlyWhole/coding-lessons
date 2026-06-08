import type { RunRequest, RunResult, Sandbox } from "@trellis/schema";
import { realClock, type Clock } from "./clock.js";
import { PINNED_PYODIDE_URL } from "./pinned.js";
import type { WorkerFactory } from "./protocol.js";
import { WorkerHost } from "./worker-host.js";
import { WarmPool, type PoolStatus } from "./warm-pool.js";

export interface SandboxConfig {
  workerFactory: WorkerFactory;
  poolSize?: number; // default 2
  memoryMb?: number; // warm-pool worker cap; default 256
  pyodideUrl?: string; // default PINNED_PYODIDE_URL
  clock?: Clock; // default realClock
  warmupTimeoutMs?: number; // default 30_000
}

// The concrete sandbox extends the frozen `Sandbox` with lifecycle observability.
// This adds methods; it does NOT change the frozen contract (still `{ run }`).
export interface ManagedSandbox extends Sandbox {
  warmup(): Promise<void>;
  status(): PoolStatus;
  dispose(): void;
}

export function createSandbox(config: SandboxConfig): ManagedSandbox {
  const clock = config.clock ?? realClock;
  const memoryMb = config.memoryMb ?? 256;
  const pyodideUrl = config.pyodideUrl ?? PINNED_PYODIDE_URL;
  const warmupTimeoutMs = config.warmupTimeoutMs ?? 30_000;
  const poolSize = config.poolSize ?? 2;

  const pool = new WarmPool(config.workerFactory, {
    poolSize,
    memoryMb,
    pyodideUrl,
    clock,
    warmupTimeoutMs,
  });
  pool.start();

  // Run on a one-off worker (not from the pool); terminate it when done.
  async function runDedicated(req: RunRequest): Promise<RunResult> {
    const host = new WorkerHost(config.workerFactory, {
      memoryMb: req.memoryMb,
      pyodideUrl,
      clock,
      warmupTimeoutMs,
    });
    const start = clock.now();
    try {
      await host.ready();
      return await raceRun(host, req, start, () => host.terminate());
    } catch (err) {
      // Warmup failure (init-error / warmup timeout / crash before ready). The pooled
      // path absorbs this in WarmPool.spawn's .catch; mirror that here as a structured
      // runtime error instead of letting a raw throw escape to the caller.
      return {
        ran: false,
        stdout: "",
        wallMs: clock.now() - start,
        timedOut: false,
        error: { type: "runtime", message: err instanceof Error ? err.message : String(err) },
      };
    } finally {
      host.terminate();
    }
  }

  // Race the worker's result against the host-armed watchdog.
  async function raceRun(
    host: WorkerHost,
    req: RunRequest,
    start: number,
    onTimeoutKill: () => void,
  ): Promise<RunResult> {
    let timedOut = false;
    const timer = clock.setTimer(() => {
      timedOut = true;
      onTimeoutKill();
    }, req.timeoutMs);
    try {
      const result = await host.run(req);
      clock.clearTimer(timer);
      return { ...result, wallMs: clock.now() - start };
    } catch (err) {
      clock.clearTimer(timer);
      if (timedOut) {
        return { ran: false, stdout: "", wallMs: clock.now() - start, timedOut: true };
      }
      // Unexpected worker death (crash) → surface as a runtime error.
      return {
        ran: false,
        stdout: "",
        wallMs: clock.now() - start,
        timedOut: false,
        error: { type: "runtime", message: err instanceof Error ? err.message : String(err) },
      };
    }
  }

  async function run(req: RunRequest): Promise<RunResult> {
    if (req.memoryMb > memoryMb) return runDedicated(req);
    const host = await pool.acquire();
    const start = clock.now();
    const result = await raceRun(host, req, start, () => host.terminate());
    if (result.timedOut || host.state === "dead") pool.discard(host);
    else pool.release(host);
    return result;
  }

  return {
    run,
    warmup: () => pool.warmup(),
    status: () => pool.status(),
    dispose: () => pool.drain(),
  };
}
