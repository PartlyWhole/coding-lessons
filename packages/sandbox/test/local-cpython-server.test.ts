// Server-specific contract for the warm-server CPython twin (speedup plan, Task 1).
// The existing local-cpython.test.ts is the behavioral spec and stays byte-identical;
// this file pins the server lifecycle: watchdog kill->respawn, crash recovery, fd
// hygiene, RSS recycle, request serialization, and the amortized-startup perf win.
import { describe, it, expect, afterAll } from "vitest";
import { createLocalSandbox } from "../src/local-cpython.js";

const sb = createLocalSandbox();
afterAll(() => sb.dispose?.());

describe("warm-server twin: performance contract", () => {
  it("amortizes interpreter startup: 20 runs well under 20x spawn cost", async () => {
    await sb.run({ code: "pass", timeoutMs: 5000, memoryMb: 256 }); // warm it
    const t0 = Date.now();
    for (let i = 0; i < 20; i++) {
      const r = await sb.run({ code: `print(${i})`, timeoutMs: 5000, memoryMb: 256 });
      expect(r.stdout).toBe(`${i}\n`);
    }
    // 20 spawnSync round trips cost ~600ms+ (~31ms each measured); the warm server
    // must do 20 requests in < 400ms even on a loaded machine.
    expect(Date.now() - t0).toBeLessThan(400);
  });
});

describe("warm-server twin: watchdog and lifecycle", () => {
  it("timeout -> timedOut:true, and the NEXT run works (kill + respawn)", async () => {
    const t = await sb.run({ code: "while True:\n    pass", timeoutMs: 500, memoryMb: 256 });
    expect(t.timedOut).toBe(true);
    expect(t.ran).toBe(false);
    expect(t.wallMs).toBe(0); // determinism: never Date.now
    const ok = await sb.run({ code: "print('alive')", timeoutMs: 5000, memoryMb: 256 });
    expect(ok.ran).toBe(true);
    expect(ok.stdout).toBe("alive\n");
  });

  it("learner os._exit kills the server -> infra runtime error, next run works", async () => {
    const r = await sb.run({ code: "import os\nos._exit(7)", timeoutMs: 5000, memoryMb: 256 });
    expect(r.ran).toBe(false);
    expect(r.timedOut).toBe(false);
    expect(r.error?.type).toBe("runtime");
    const ok = await sb.run({ code: "print('back')", timeoutMs: 5000, memoryMb: 256 });
    expect(ok.stdout).toBe("back\n");
  });

  it("C-level writes to fd 1 cannot corrupt the reply framing", async () => {
    // print() is captured by the harness; os.write(1, ...) bypasses Python-level
    // capture and would land in the protocol stream unless fd 1 is parked on devnull.
    const r = await sb.run({
      code: "import os\nos.write(1, b'JUNKJUNKJUNK')\nprint('clean')",
      timeoutMs: 5000,
      memoryMb: 256,
    });
    expect(r.ran).toBe(true);
    expect(r.stdout).toBe("clean\n"); // junk neither in stdout nor able to break framing
    const next = await sb.run({ code: "print('still ok')", timeoutMs: 5000, memoryMb: 256 });
    expect(next.stdout).toBe("still ok\n");
  });

  it("input() with no stdin gets EOFError, same as the spawnSync twin", async () => {
    // The server's real stdin is the protocol pipe; learner reads must NOT consume it.
    const r = await sb.run({ code: "input()", timeoutMs: 5000, memoryMb: 256 });
    expect(r.ran).toBe(true);
    expect(r.error?.type).toBe("runtime");
    expect(r.error?.message).toContain("EOFError");
  });

  it("recycles on the memory watermark and stays correct", async () => {
    // Allocate ~80MB inside a run; with a 64MB watermark the server must self-retire
    // AFTER replying (mirroring worker-host recycle) and the next run respawns fresh.
    const small = createLocalSandbox({ recycleRssMb: 64 });
    try {
      await small.run({ code: "pass", timeoutMs: 5000, memoryMb: 256 }); // warm
      const pidBefore = small.serverPid?.();
      expect(pidBefore).toBeTypeOf("number");
      const big = await small.run({
        code: "x = bytearray(80 * 1024 * 1024)\nprint(len(x) > 0)",
        timeoutMs: 10000,
        memoryMb: 256,
      });
      expect(big.stdout).toBe("True\n"); // recycle happens AFTER the reply is served
      const after = await small.run({ code: "print('fresh')", timeoutMs: 5000, memoryMb: 256 });
      expect(after.stdout).toBe("fresh\n");
      expect(small.serverPid?.()).toBeTypeOf("number");
      expect(small.serverPid?.()).not.toBe(pidBefore); // a NEW child served it
    } finally {
      small.dispose?.();
    }
  });

  it("warm reuse keeps sys.modules (production warm-worker semantics), fresh ns per run", async () => {
    const a = await sb.run({
      code: "import sys\nmarker = 1\nimport json\nprint('json' in sys.modules)",
      timeoutMs: 5000,
      memoryMb: 256,
    });
    expect(a.stdout).toBe("True\n");
    // fresh ns: the previous run's top-level binding must NOT leak
    const b = await sb.run({ code: "print('marker' in dir())", timeoutMs: 5000, memoryMb: 256 });
    expect(b.stdout).toBe("False\n");
  });

  it("serializes concurrent callers (one in-flight request at a time)", async () => {
    const rs = await Promise.all(
      [..."abcde"].map((c) => sb.run({ code: `print('${c}')`, timeoutMs: 5000, memoryMb: 256 })),
    );
    expect(rs.map((r) => r.stdout)).toEqual(["a\n", "b\n", "c\n", "d\n", "e\n"]);
  });
});
