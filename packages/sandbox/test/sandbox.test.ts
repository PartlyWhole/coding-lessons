import { describe, it, expect } from "vitest";
import { createSandbox } from "../src/sandbox.js";
import { makeMockFactory, FakeClock, flush } from "./mock-worker.js";

const base = { code: "print('hi')", timeoutMs: 1000, memoryMb: 256 };

describe("createSandbox (gate behaviors)", () => {
  it("a warm trivial run completes within budget", async () => {
    const clock = new FakeClock();
    const { factory } = makeMockFactory({
      onRun: () => ({ ran: true, stdout: "hi\n", returnValue: null, wallMs: 1, timedOut: false }),
    });
    const sb = createSandbox({ workerFactory: factory, clock, poolSize: 1 });
    await sb.warmup();
    const res = await sb.run({ ...base });
    expect(res.ran).toBe(true);
    expect(res.timedOut).toBe(false);
    expect(res.stdout).toBe("hi\n");
    expect(res.wallMs).toBeGreaterThanOrEqual(0);
    sb.dispose();
  });

  it("an infinite-loop submission is killed by the watchdog → timedOut:true, not a hang", async () => {
    const clock = new FakeClock();
    const { factory, workers } = makeMockFactory({ onRun: () => "hang" });
    const sb = createSandbox({ workerFactory: factory, clock, poolSize: 1 });
    await sb.warmup();
    const p = sb.run({ ...base, code: "while True: pass", timeoutMs: 2000 });
    await flush();
    clock.advance(2000); // watchdog fires
    const res = await p;
    expect(res.timedOut).toBe(true);
    expect(res.ran).toBe(false);
    expect(workers[0]?.terminated).toBe(true); // killed
    // a replacement was spun up to restore the warm pool
    await sb.warmup();
    await flush();
    expect(workers.length).toBe(2);
    sb.dispose();
  });

  it("reports a syntax error with type + line", async () => {
    const clock = new FakeClock();
    const { factory } = makeMockFactory({
      onRun: () => ({
        ran: false, stdout: "", wallMs: 0, timedOut: false,
        error: { type: "syntax", message: "invalid syntax", line: 1 },
      }),
    });
    const sb = createSandbox({ workerFactory: factory, clock, poolSize: 1 });
    await sb.warmup();
    const res = await sb.run({ ...base, code: "def f(:" });
    expect(res.ran).toBe(false);
    expect(res.error?.type).toBe("syntax");
    expect(res.error?.line).toBe(1);
    sb.dispose();
  });

  it("reports a runtime error with type + line (ran stays true)", async () => {
    const clock = new FakeClock();
    const { factory } = makeMockFactory({
      onRun: () => ({
        ran: true, stdout: "", wallMs: 1, timedOut: false,
        error: { type: "runtime", message: "ZeroDivisionError: division by zero", line: 2 },
      }),
    });
    const sb = createSandbox({ workerFactory: factory, clock, poolSize: 1 });
    await sb.warmup();
    const res = await sb.run({ ...base, code: "x=1\nprint(1/0)" });
    expect(res.ran).toBe(true);
    expect(res.error?.type).toBe("runtime");
    expect(res.error?.line).toBe(2);
    sb.dispose();
  });

  it("cold warm-up state is observable via status()", async () => {
    const clock = new FakeClock();
    const { factory } = makeMockFactory();
    const sb = createSandbox({ workerFactory: factory, clock, poolSize: 2 });
    expect(sb.status().warming).toBe(2);
    expect(sb.status().ready).toBe(0);
    await sb.warmup();
    await flush();
    expect(sb.status().ready).toBeGreaterThanOrEqual(1);
    sb.dispose();
  });

  it("a mem-cap recycle is self-healing: structured failure, worker replaced, next run green", async () => {
    const clock = new FakeClock();
    const capError = {
      ran: false as const,
      stdout: "",
      wallMs: 3,
      timedOut: false,
      error: { type: "runtime" as const, message: "memory limit exceeded: memoryMb=256" },
    };
    let runs = 0;
    const { factory, workers } = makeMockFactory({
      onRun: () => {
        runs += 1;
        // first run blows the cap (worker asks to be recycled); later runs are healthy
        if (runs === 1) return { result: capError, recycle: true as const };
        return { ran: true, stdout: "healthy\n", wallMs: 1, timedOut: false };
      },
    });
    const sb = createSandbox({ workerFactory: factory, clock, poolSize: 1 });
    await sb.warmup();
    const res = await sb.run({ ...base, code: "bytearray(600*1024*1024)" });
    expect(res.ran).toBe(false);
    expect(res.timedOut).toBe(false);
    expect(res.error?.type).toBe("runtime");
    expect(res.error?.message).toMatch(/memory limit/i);
    expect(workers[0]?.terminated).toBe(true); // capped worker torn down…
    await flush();
    expect(workers.length).toBe(2); // …and the pool spawned a replacement
    const next = await sb.run({ ...base });
    expect(next.ran).toBe(true);
    expect(next.stdout).toBe("healthy\n");
    expect(sb.status().total).toBe(1); // pool back at full strength
    sb.dispose();
  });

  it("a request exceeding the pool memory cap runs on a dedicated worker", async () => {
    const clock = new FakeClock();
    const { factory, workers } = makeMockFactory();
    const sb = createSandbox({ workerFactory: factory, clock, poolSize: 1, memoryMb: 128 });
    await sb.warmup();
    const res = await sb.run({ ...base, memoryMb: 512 });
    expect(res.ran).toBe(true);
    // dedicated worker created with the larger cap, then terminated
    const dedicated = workers.find((w) => w.initMemoryMb === 512);
    expect(dedicated).toBeDefined();
    expect(dedicated?.terminated).toBe(true);
    sb.dispose();
  });

  it("a dedicated-worker warmup failure surfaces as a structured runtime error", async () => {
    const clock = new FakeClock();
    const { factory } = makeMockFactory({ ready: "never" });
    const sb = createSandbox({
      workerFactory: factory,
      clock,
      poolSize: 1,
      memoryMb: 128,
      warmupTimeoutMs: 5000,
    });
    const p = sb.run({ ...base, memoryMb: 512 }); // > pool cap → dedicated worker
    clock.advance(5000); // dedicated host warmup times out
    const res = await p;
    expect(res.ran).toBe(false);
    expect(res.timedOut).toBe(false);
    expect(res.error?.type).toBe("runtime");
    expect(res.error?.message).toMatch(/warmup/i);
    sb.dispose();
  });
});
