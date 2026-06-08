import type { Clock } from "./clock.js";
import type { WorkerFactory } from "./protocol.js";
import { WorkerHost } from "./worker-host.js";

export interface WarmPoolConfig {
  poolSize: number;
  memoryMb: number;
  pyodideUrl: string;
  clock: Clock;
  warmupTimeoutMs: number;
}

export interface PoolStatus {
  warming: number;
  ready: number;
  running: number;
  total: number;
}

export class WarmPool {
  private readonly all = new Set<WorkerHost>();
  private readonly available: WorkerHost[] = [];
  private readonly waiters: Array<(h: WorkerHost) => void> = [];
  private started = false;

  constructor(
    private readonly factory: WorkerFactory,
    private readonly config: WarmPoolConfig,
  ) {}

  start(): void {
    if (this.started) return;
    this.started = true;
    for (let i = 0; i < this.config.poolSize; i++) this.spawn();
  }

  private spawn(): void {
    const host = new WorkerHost(this.factory, {
      memoryMb: this.config.memoryMb,
      pyodideUrl: this.config.pyodideUrl,
      clock: this.config.clock,
      warmupTimeoutMs: this.config.warmupTimeoutMs,
    });
    this.all.add(host);
    host
      .ready()
      .then(() => this.makeAvailable(host))
      .catch(() => this.discard(host));
  }

  private makeAvailable(host: WorkerHost): void {
    if (!this.all.has(host) || host.state === "dead") return;
    const waiter = this.waiters.shift();
    if (waiter) {
      waiter(host); // handed straight to a waiter; stays "checked out"
    } else {
      this.available.push(host);
    }
  }

  acquire(): Promise<WorkerHost> {
    const h = this.available.pop();
    if (h) return Promise.resolve(h);
    return new Promise<WorkerHost>((resolve) => this.waiters.push(resolve));
  }

  // Return a reusable host (after a normal run) to the available set.
  release(host: WorkerHost): void {
    if (host.state === "ready") this.makeAvailable(host);
    else this.discard(host);
  }

  // A host is dead/terminated: drop it and spawn a replacement to keep warm count.
  discard(host: WorkerHost): void {
    const idx = this.available.indexOf(host);
    if (idx >= 0) this.available.splice(idx, 1);
    if (this.all.delete(host)) {
      host.terminate();
      if (this.started) this.spawn();
    }
  }

  // Resolves when at least one host is ready (or already available).
  async warmup(): Promise<void> {
    if (this.available.length > 0) return;
    const h = await this.acquire();
    this.available.push(h); // put it back; warmup only observes readiness
    // de-dupe if a waiter race left it absent
    if (this.available.indexOf(h) !== this.available.lastIndexOf(h)) this.available.pop();
  }

  status(): PoolStatus {
    let warming = 0;
    let ready = 0;
    let running = 0;
    for (const h of this.all) {
      if (h.state === "warming") warming++;
      else if (h.state === "running") running++;
      else if (h.state === "ready") ready++;
    }
    // `ready` counts ready hosts; only those in `available` are acquirable.
    return { warming, ready: this.available.length, running, total: this.all.size };
  }

  drain(): void {
    for (const h of [...this.all]) {
      this.all.delete(h);
      h.terminate();
    }
    this.available.length = 0;
  }
}
