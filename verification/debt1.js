// Debt 1 — M3a @trellis/sandbox host verification under REAL Pyodide.
// Imports the BUILT package dist directly (the barrel re-exports the node-only
// local-cpython twin, so we import the browser-safe modules individually).
import { createSandbox } from "../packages/sandbox/dist/src/sandbox.js";
import { browserWorkerFactory } from "../packages/sandbox/dist/src/browser-worker.js";
import { PYODIDE_VERSION, PINNED_PYODIDE_URL } from "../packages/sandbox/dist/src/pinned.js";

const WORKER_URL = new URL("../packages/sandbox/dist/src/pyodide-worker.js", import.meta.url);
const logEl = document.getElementById("log");
const results = [];
function record(name, pass, evidence) {
  results.push({ name, pass, evidence });
  logEl.textContent = JSON.stringify(results, null, 2);
}

async function main() {
  // ── 1. CDN pin resolves ─────────────────────────────────────────────
  try {
    const resp = await fetch(`${PINNED_PYODIDE_URL}pyodide.mjs`, { method: "HEAD" });
    record("1-cdn-pin-resolves", resp.ok && PYODIDE_VERSION === "0.27.2", {
      PYODIDE_VERSION, PINNED_PYODIDE_URL, httpStatus: resp.status,
    });
  } catch (e) {
    record("1-cdn-pin-resolves", false, { error: String(e) });
  }

  // ── 2. Cold start: "warming" observable, warmup within budget ──────
  const sb = createSandbox({ workerFactory: browserWorkerFactory(WORKER_URL) });
  const statusAtCreate = sb.status();
  const t0 = performance.now();
  await sb.warmup();
  const warmupMs = Math.round(performance.now() - t0);
  const statusAfterWarmup = sb.status();
  record(
    "2-cold-start-warming-observable",
    statusAtCreate.warming === 2 && statusAtCreate.ready === 0 &&
      statusAfterWarmup.ready >= 1 && warmupMs < 30000,
    { statusAtCreate, statusAfterWarmup, warmupMs, budgetMs: 30000 },
  );

  const run = (req) => sb.run({ timeoutMs: 10000, memoryMb: 256, ...req });

  // ── 3. Basic run: stdout captured ───────────────────────────────────
  const r3 = await run({ code: 'print("hello from real pyodide")' });
  record("3-basic-run-stdout", r3.ran === true && r3.stdout === "hello from real pyodide\n" && !r3.error, r3);

  // ── 4. Fresh namespace per call (reused warm worker must not leak) ──
  const r4a = await run({ code: "x = 42\nprint('set', x)" });
  const r4b = await run({ code: "print(x)" }); // must NameError if ns is fresh
  record(
    "4-fresh-namespace-per-call",
    r4a.ran === true && r4b.ran === true &&
      r4b.error?.type === "runtime" && /NameError/.test(r4b.error?.message ?? ""),
    { firstRun: r4a, secondRun: r4b },
  );

  // ── 5. js FFI must be UNREACHABLE from learner code (§6.1 boundary) ─
  // Stream J hardening: RUN_HARNESS pops the JS-bridge modules + JsFinder around the
  // learner exec and arms an import blocker → clean ImportError, host machinery intact.
  const BLOCK_MSG = "is not available in the Trellis sandbox";
  const blocked = (r) =>
    r.error?.type === "runtime" &&
    /ImportError/.test(r.error?.message ?? "") &&
    r.error.message.includes(BLOCK_MSG);
  const r5a = await run({ code: "import js\nprint(type(js))" });
  const r5b = await run({ code: "import pyodide_js\nprint(type(pyodide_js))" });
  const r5c = await run({ code: "import pyodide.code\nprint(pyodide.code.run_js)" }); // run_js = JS escape
  const r5d = await run({ code: "from js import fetch" });
  // exhaustive sweep DURING a run: no JsProxy-typed module (and no pyodide/_pyodide
  // module) may be visible in sys.modules while learner code executes
  const r5e = await run({
    code:
      "import sys\n" +
      "leaks = sorted(n for n, m in sys.modules.items()\n" +
      "    if 'JsProxy' in type(m).__name__\n" +
      "    or type(m).__module__.split('.', 1)[0] in ('pyodide', '_pyodide')\n" +
      "    or n.split('.', 1)[0] in ('js', 'pyodide_js', 'pyodide', '_pyodide'))\n" +
      "print(leaks)",
  });
  // host machinery must stay green ON THE SAME (reused) workers after blocked runs:
  const r5f = await run({ code: "def main():\n    import math\n    return math.floor(2.5)", entrypoint: "main" });
  const r5g = await sb.parseAndMatch("x = 1 + 2", [
    { tag: "has_binop", query: { node: "BinOp" } },
  ]);
  record(
    "5-js-ffi-blocked",
    blocked(r5a) && blocked(r5b) && blocked(r5c) && blocked(r5d) &&
      r5e.ran === true && r5e.stdout === "[]\n" && !r5e.error &&
      r5f.returnValue === 2 && Array.isArray(r5g) && r5g.includes("has_binop"),
    {
      import_js: r5a, import_pyodide_js: r5b, import_pyodide_code: r5c,
      from_js_import_fetch: r5d, jsproxy_sweep_during_run: r5e,
      host_entrypoint_after_block: r5f, parse_and_match_after_block: r5g,
    },
  );

  // ── 6. Syntax error: type + line from real traceback ───────────────
  const r6 = await run({ code: "def f(:\n    pass" });
  record("6-syntax-error-line", r6.error?.type === "syntax" && r6.error?.line === 1, r6);

  // ── 7. Runtime error: type + line from real traceback ──────────────
  const r7 = await run({ code: "a = 1\nb = 1 / 0" });
  record(
    "7-runtime-error-line",
    r7.error?.type === "runtime" && r7.error?.line === 2 && /ZeroDivisionError/.test(r7.error?.message ?? ""),
    r7,
  );

  // ── 8. Entrypoint + returnValue (structured-clone boundary) ────────
  const r8 = await run({ code: "def main():\n    return 2 + 3", entrypoint: "main" });
  record("8-entrypoint-return-value", r8.ran === true && r8.returnValue === 5, r8);

  // ── 9. stdin wiring ─────────────────────────────────────────────────
  const r9 = await run({ code: "print(input())", stdin: "abc" });
  record("9-stdin", r9.ran === true && r9.stdout === "abc\n", r9);

  // ── 10. Watchdog kill switch: infinite loop → terminate, not a hung tab
  const t10 = performance.now();
  const r10 = await run({ code: "while True:\n    pass", timeoutMs: 2000 });
  const watchdogMs = Math.round(performance.now() - t10);
  // pool must spin a replacement and still serve runs afterwards
  const r10b = await run({ code: "print('alive after kill')" });
  // give the replacement a beat, then read pool status
  await new Promise((res) => setTimeout(res, 100));
  const statusAfterKill = sb.status();
  record(
    "10-watchdog-terminate-and-respawn",
    r10.ran === false && r10.timedOut === true && watchdogMs < 4000 &&
      r10b.ran === true && r10b.stdout === "alive after kill\n" && statusAfterKill.total === 2,
    { timedOutResult: r10, watchdogMs, followUpRun: r10b, statusAfterKill },
  );

  // ── 11. Memory cap ENFORCED: oversized alloc → structured failure + recycle ─
  // Stream J hardening: wasmMemory grow-guard (preemptive) + post-run watermark;
  // a capped worker is retired and the pool self-heals (like the watchdog path).
  const r11 = await run({
    code: "data = bytearray(600 * 1024 * 1024)\nprint('allocated', len(data))",
    memoryMb: 256, timeoutMs: 30000,
  });
  // next run must succeed (fresh/healthy worker from the pool)
  const r11b = await run({ code: "print('alive after cap kill')" });
  await new Promise((res) => setTimeout(res, 100));
  const statusAfterCap = sb.status();
  record(
    "11-memory-cap-enforced",
    r11.ran === false && r11.timedOut === false &&
      r11.error?.type === "runtime" && /memory limit exceeded/.test(r11.error?.message ?? "") &&
      /heap growth refused by the cap guard/.test(r11.error?.message ?? "") /* PREEMPTIVE, not just watermark */ &&
      r11.stdout === "" /* the oversized alloc never 'succeeded' */ &&
      r11b.ran === true && r11b.stdout === "alive after cap kill\n" && statusAfterCap.total === 2,
    { cappedRun: r11, followUpRun: r11b, statusAfterCap },
  );

  // ── 12. Warm pool hides respawn latency: warm run ≪ cold start ─────
  const t12 = performance.now();
  const r12 = await run({ code: "print(1+1)" });
  const warmRunMs = Math.round(performance.now() - t12);
  record("12-warm-run-latency", r12.ran === true && warmRunMs < 2000, { warmRunMs, coldWarmupMs: warmupMs });

  // ── 13. pygame-ce wheel smoke (direct Pyodide, runtime:"pygame" seam) ─
  try {
    const mod = await import(/* @vite-ignore */ `${PINNED_PYODIDE_URL}pyodide.mjs`);
    const py = await mod.loadPyodide({ indexURL: PINNED_PYODIDE_URL });
    await py.loadPackage("pygame-ce");
    const ver = await py.runPythonAsync("import pygame; pygame.version.ver");
    record("13-pygame-ce-wheel-smoke", typeof ver === "string" && ver.length > 0, { pygameVersion: ver });
  } catch (e) {
    record("13-pygame-ce-wheel-smoke", false, { error: String(e) });
  }

  sb.dispose();
  window.__DEBT1_DONE__ = true;
  window.__DEBT1_RESULTS__ = results;
}

main().catch((e) => {
  record("FATAL", false, { error: String(e), stack: e?.stack });
  window.__DEBT1_DONE__ = true;
  window.__DEBT1_RESULTS__ = results;
});
