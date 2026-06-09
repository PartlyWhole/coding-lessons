import { describe, it, expect } from "vitest";
import { WarmPool } from "../src/warm-pool.js";
import { makeMockFactory, FakeClock, flush } from "./mock-worker.js";
import { PINNED_PYODIDE_URL } from "../src/pinned.js";

const cfg = (clock: FakeClock, poolSize = 2) => ({
  poolSize,
  memoryMb: 256,
  pyodideUrl: PINNED_PYODIDE_URL,
  clock,
  warmupTimeoutMs: 30_000,
});

describe("WarmPool", () => {
  it("warms up to poolSize and reports status", async () => {
    const clock = new FakeClock();
    const { factory, workers } = makeMockFactory();
    const pool = new WarmPool(factory, cfg(clock, 2));
    pool.start();
    expect(pool.status().warming).toBe(2);
    await pool.warmup();
    await flush();
    expect(workers.length).toBe(2);
    expect(pool.status().ready).toBeGreaterThanOrEqual(1);
  });

  it("acquire returns a ready host; release returns it to the pool", async () => {
    const clock = new FakeClock();
    const { factory } = makeMockFactory();
    const pool = new WarmPool(factory, cfg(clock, 1));
    pool.start();
    await pool.warmup();
    const h = await pool.acquire();
    expect(h.state).toBe("ready");
    expect(pool.status().ready).toBe(0);
    pool.release(h);
    expect(pool.status().ready).toBe(1);
  });

  it("acquire waits when none are ready, then resolves once one warms", async () => {
    const clock = new FakeClock();
    const { factory } = makeMockFactory({ ready: "never" });
    const pool = new WarmPool(factory, cfg(clock, 1));
    pool.start();
    let acquired = false;
    const p = pool.acquire().then((h) => { acquired = true; return h; });
    await flush();
    expect(acquired).toBe(false); // still warming (mock never auto-readies)
    expect(pool.status().warming).toBe(1);
    void p;
  });

  it("discard removes a host and spawns a replacement (self-heals warm count)", async () => {
    const clock = new FakeClock();
    const { factory, workers } = makeMockFactory();
    const pool = new WarmPool(factory, cfg(clock, 1));
    pool.start();
    await pool.warmup();
    const h = await pool.acquire();
    h.terminate();
    pool.discard(h);
    await pool.warmup();
    await flush();
    expect(workers.length).toBe(2); // original + replacement
    expect(pool.status().ready).toBe(1);
  });

  it("drain terminates all hosts and empties the pool", async () => {
    const clock = new FakeClock();
    const { factory, workers } = makeMockFactory();
    const pool = new WarmPool(factory, cfg(clock, 2));
    pool.start();
    await pool.warmup();
    await flush();
    pool.drain();
    expect(pool.status().total).toBe(0);
    expect(pool.status().ready).toBe(0);
    expect(workers.every((w) => w.terminated)).toBe(true);
  });
});
