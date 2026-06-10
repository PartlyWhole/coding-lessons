import { describe, it, expect } from "vitest";
import { mkdtempSync, rmSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { parsePython, runCase, runCases, DEFAULT_CACHE_DIR } from "../src/ast/python.js";

describe("python bridge", () => {
  it("parses code to a JSON AST", () => {
    const p = parsePython("print('hi')");
    expect(p.syntaxError).toBe(false);
    if (!p.syntaxError) expect(p.ast._type).toBe("Module");
  });
  it("reports syntax errors", () => {
    const p = parsePython("def f(:\n  pass");
    expect(p.syntaxError).toBe(true);
  });
  it("runs a passing stdin case", () => {
    const r = runCase({ code: "print('Hi Alan!')", mode: "stdin", expected: "Hi Alan!\n", stdin: null });
    expect(r).toEqual({ ran: true, errType: null, ok: true });
  });
  it("runs a passing entrypoint case", () => {
    const r = runCase({ code: "def greet(n):\n return 'Hi ' + n + '!'", mode: "entrypoint", entry: "greet", args: ["Alan"], expected: "Hi Alan!" });
    expect(r).toEqual({ ran: true, errType: null, ok: true });
  });
  it("detects a runtime error", () => {
    const r = runCase({ code: "def f(x):\n return 'a' + x", mode: "entrypoint", entry: "f", args: [7], expected: "a7" });
    expect(r.errType).toBe("runtime");
    expect(r.ok).toBe(false);
  });
});

describe("runCases (batched bridge)", () => {
  it("matches runCase semantics across the mode/error matrix in ONE invocation", () => {
    const rs = runCases([
      { code: "x = 1", mode: "bare" },
      { code: "def f(:", mode: "bare" }, // syntax
      { code: "1/0", mode: "bare" }, // runtime
      { code: "def sol(a, b):\n    return a + b", mode: "entrypoint", entry: "sol", args: [2, 3], expected: 5 },
      { code: "def sol(a, b):\n    return a - b", mode: "entrypoint", entry: "sol", args: [2, 3], expected: 5 }, // ok:false
      { code: "print('Hi ' + input() + '!')", mode: "stdin", stdin: "Alan\n", expected: "Hi Alan!\n" },
      { code: "import random as r\nrandom = __import__('random')\nrandom.seed(99)", mode: "bare" },
    ]);
    expect(rs.map((r) => [r.ran, r.errType, r.ok])).toEqual([
      [true, null, true],
      [false, "syntax", false],
      [true, "runtime", false],
      [true, null, true],
      [true, null, false],
      [true, null, true],
      [true, null, true],
    ]);
  });

  it("seeded entrypoint cases reproduce run_case exactly (PRNG isolation per case)", () => {
    const spec = {
      code: "def sol(n):\n    import random\n    return random.randint(1, n)",
      mode: "entrypoint" as const,
      entry: "sol",
      args: [100],
      seed: 42,
      expected: 82, // pinned from the live runCase value (python3 seed 42 -> randint(1,100) == 82)
    };
    const single = runCase({ ...spec });
    expect(single).toEqual({ ran: true, errType: null, ok: true });
    // Two copies in one batch: both must agree with the subprocess result —
    // proves per-case seeding isn't polluted by a shared interpreter.
    const [a, b] = runCases([spec, spec]);
    expect(a).toEqual(single);
    expect(b).toEqual(single);
  });

  it("a deliberate runaway fails ITS case only; neighbors complete", () => {
    const rs = runCases([
      { code: "print('before')", mode: "bare" },
      { code: "while True:\n    pass", mode: "bare", timeoutSec: 1 },
      { code: "print('after')", mode: "bare" },
    ]);
    expect(rs[0]).toEqual({ ran: true, errType: null, ok: true });
    expect(rs[1]!.errType).toBe("timeout");
    expect(rs[1]!.ran).toBe(true); // run_case parity: timeout is a run, not a syntax fail
    expect(rs[2]).toEqual({ ran: true, errType: null, ok: true });
  });

  it("sys.exit(0) vs sys.exit(3) lockstep with run_case", () => {
    const batch = runCases([
      { code: "import sys\nprint('done')\nsys.exit(0)", mode: "stdin", stdin: "", expected: "done\n" },
      { code: "import sys\nsys.exit(3)", mode: "bare" },
    ]);
    const singles = [
      runCase({ code: "import sys\nprint('done')\nsys.exit(0)", mode: "stdin", stdin: "", expected: "done\n" }),
      runCase({ code: "import sys\nsys.exit(3)", mode: "bare" }),
    ];
    expect(batch).toEqual(singles);
  });

  it("runtime-raised SyntaxError classifies as syntax (run_case stderr-heuristic lockstep)", () => {
    const code = "compile('def f(:', '<x>', 'exec')";
    expect(runCases([{ code, mode: "bare" }])[0]).toEqual(runCase({ code, mode: "bare" }));
  });

  it("empty batch is a no-op (no spawn)", () => {
    expect(runCases([])).toEqual([]);
  });
});

describe("runCases disk cache", () => {
  const specs = [
    { code: "def sol(a):\n    return a * 3", mode: "entrypoint" as const, entry: "sol", args: [7], expected: 21 },
    { code: "1/0", mode: "bare" as const },
  ];
  it("cold run == warm run == re-cold run (pure memo)", () => {
    const dir = mkdtempSync(join(tmpdir(), "trellis-cache-"));
    const cold = runCases(specs, { cacheDir: dir });
    const warm = runCases(specs, { cacheDir: dir });
    rmSync(dir, { recursive: true, force: true });
    const dir2 = mkdtempSync(join(tmpdir(), "trellis-cache-"));
    const recold = runCases(specs, { cacheDir: dir2 });
    rmSync(dir2, { recursive: true, force: true });
    expect(warm).toEqual(cold);
    expect(recold).toEqual(cold);
  });
  it("warm hits skip python entirely (fully-cached batches spawn nothing)", () => {
    const dir = mkdtempSync(join(tmpdir(), "trellis-cache-"));
    try {
      runCases(specs, { cacheDir: dir });
      const t0 = Date.now();
      for (let i = 0; i < 10; i++) runCases(specs, { cacheDir: dir });
      // 10 fully-cached batches: no spawns (a single spawn alone costs ~25-50ms).
      expect(Date.now() - t0).toBeLessThan(100);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
  it("default cache dir resolves under the repo root's node_modules/.cache", () => {
    const norm = DEFAULT_CACHE_DIR.split("\\").join("/");
    expect(norm.endsWith("node_modules/.cache/trellis-gate-exec")).toBe(true);
    const repoRoot = resolve(DEFAULT_CACHE_DIR, "../../..");
    expect(existsSync(resolve(repoRoot, "pnpm-workspace.yaml"))).toBe(true);
  });
  it("TRELLIS_GATE_CACHE=0 bypasses read AND write", () => {
    const dir = mkdtempSync(join(tmpdir(), "trellis-cache-"));
    process.env["TRELLIS_GATE_CACHE"] = "0";
    try {
      runCases(specs, { cacheDir: dir });
      // bypass leaves the cache dir empty
      expect(readdirSync(dir)).toEqual([]);
    } finally {
      delete process.env["TRELLIS_GATE_CACHE"];
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
