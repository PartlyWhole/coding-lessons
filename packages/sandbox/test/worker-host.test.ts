import { describe, it, expect } from "vitest";
import { WorkerHost } from "../src/worker-host.js";
import { makeMockFactory, FakeClock, flush } from "./mock-worker.js";
import { PINNED_PYODIDE_URL } from "../src/pinned.js";

const cfg = (clock: FakeClock) => ({
  memoryMb: 256,
  pyodideUrl: PINNED_PYODIDE_URL,
  clock,
  warmupTimeoutMs: 30_000,
});

describe("WorkerHost", () => {
  it("posts init with memoryMb and becomes ready", async () => {
    const clock = new FakeClock();
    const { factory, workers } = makeMockFactory();
    const host = new WorkerHost(factory, cfg(clock));
    expect(host.state).toBe("warming");
    await host.ready();
    expect(host.state).toBe("ready");
    expect(workers[0]?.initMemoryMb).toBe(256);
  });

  it("runs and resolves with the worker's RunResult, returning to ready", async () => {
    const clock = new FakeClock();
    const { factory } = makeMockFactory({
      onRun: () => ({ ran: true, stdout: "ok\n", returnValue: 7, wallMs: 2, timedOut: false }),
    });
    const host = new WorkerHost(factory, cfg(clock));
    await host.ready();
    const res = await host.run({ code: "print('ok')", timeoutMs: 1000, memoryMb: 256 });
    expect(res.returnValue).toBe(7);
    expect(host.state).toBe("ready");
  });

  it("rejects ready() and goes dead if warmup exceeds the timeout", async () => {
    const clock = new FakeClock();
    const { factory, workers } = makeMockFactory({ ready: "never" });
    const host = new WorkerHost(factory, cfg(clock));
    const p = host.ready();
    clock.advance(30_000);
    await expect(p).rejects.toThrow(/warmup/i);
    expect(host.state).toBe("dead");
    expect(workers[0]?.terminated).toBe(true);
  });

  it("terminate() rejects an in-flight run and marks the worker terminated", async () => {
    const clock = new FakeClock();
    const { factory, workers } = makeMockFactory({ onRun: () => "hang" });
    const host = new WorkerHost(factory, cfg(clock));
    await host.ready();
    const runP = host.run({ code: "while True: pass", timeoutMs: 1000, memoryMb: 256 });
    host.terminate();
    await expect(runP).rejects.toThrow(/terminated/i);
    expect(workers[0]?.terminated).toBe(true);
    expect(host.state).toBe("dead");
  });

  it("rejects ready() on init-error", async () => {
    const clock = new FakeClock();
    const factory = () => {
      const w = {
        onmessage: null as null | ((ev: { data: unknown }) => void),
        onerror: null,
        postMessage() {
          queueMicrotask(() =>
            w.onmessage?.({ data: { kind: "init-error", message: "boom" } }),
          );
        },
        terminate() {},
      };
      return w as never;
    };
    const host = new WorkerHost(factory, cfg(clock));
    await expect(host.ready()).rejects.toThrow(/boom/);
    expect(host.state).toBe("dead");
  });

  it("a result carrying recycle:true resolves the run AND retires the worker (mem-cap path)", async () => {
    const clock = new FakeClock();
    const capError = {
      ran: false as const,
      stdout: "",
      wallMs: 3,
      timedOut: false,
      error: { type: "runtime" as const, message: "memory limit exceeded: memoryMb=256" },
    };
    const { factory, workers } = makeMockFactory({
      onRun: () => ({ result: capError, recycle: true }),
    });
    const host = new WorkerHost(factory, cfg(clock));
    await host.ready();
    const res = await host.run({ code: "bytearray(600*1024*1024)", timeoutMs: 1000, memoryMb: 256 });
    expect(res.ran).toBe(false);
    expect(res.error?.type).toBe("runtime");
    expect(res.error?.message).toMatch(/memory limit/i);
    expect(res.timedOut).toBe(false); // a cap kill is NOT a timeout
    expect(host.state).toBe("dead"); // pool's release path will discard + respawn
    expect(workers[0]?.terminated).toBe(true); // the actual Worker is torn down, not leaked
  });

  it("an onerror event fails an in-flight run and goes dead", async () => {
    const clock = new FakeClock();
    const { factory, workers } = makeMockFactory({ onRun: () => "hang" });
    const host = new WorkerHost(factory, cfg(clock));
    await host.ready();
    const runP = host.run({ code: "boom", timeoutMs: 1000, memoryMb: 256 });
    workers[0]?.onerror?.({ message: "segfault" });
    await expect(runP).rejects.toThrow(/segfault/i);
    expect(host.state).toBe("dead");
    expect(workers[0]?.terminated).toBe(true);
  });
});
