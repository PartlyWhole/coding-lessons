# Stream J — sandbox worker hardening (js-FFI boundary + memory cap)

Fixes verification-report escalations 3 & 4 (Debt-1 findings A & B). Branch
`j-sandbox-hardening`, worktree `/Users/alan/Desktop/trellis-j-sandbox`. Owns
`packages/sandbox/**` + `verification/**`. Schema `Sandbox`/`RunResult` FROZEN.

## A. js-FFI boundary (finding A)

Defect: `import js` / `import pyodide_js` succeed in learner code → live `JsProxy` →
worker-scope `fetch` reachable, contradicting §6.1 "no js FFI reachable from learner code".

Fix lives in `RUN_HARNESS` (single source of truth, shared by the Pyodide worker and the
CPython twin — so the twin gets identical semantics and the behavior is TDD-able offline):

1. At harness load, install a `_TrellisBlockFinder` at `sys.meta_path[0]`. Disarmed by
   default (host machinery unaffected between runs).
2. Per run, inside `__trellis_run` around the learner `exec` + entrypoint call:
   - compute the blocklist = static roots {`js`, `pyodide_js`, `pyodide`, `_pyodide`}
     ∪ every `sys.modules` entry whose module object is a `JsProxy` (dynamic, exhaustive)
     ∪ every name registered on any meta_path finder exposing a `jsproxies` registry
     (Pyodide's `JsFinder`, i.e. anything `registerJsModule`-ed);
   - pop those names (and their submodules) from `sys.modules` (saved) so cached imports
     can't be re-hit (the import system consults `sys.modules` before `meta_path`);
   - remove any `jsproxies`-bearing finder from `sys.meta_path` (saved) so no JS-bridge
     name is resolvable at all;
   - arm the block finder → a learner `import js` raises a clean
     `ImportError: module 'js' is not available in the Trellis sandbox`;
   - `finally`: disarm, restore finders + popped modules → host machinery and the NEXT
     run on a reused warm worker are untouched.
3. Honest scope note: this blocks the import surface. In-process CPython cannot be made
   adversarially escape-proof (e.g. `sys._getframe` introspection); the hard enclosure
   remains the worker boundary (structured-clone messages + watchdog terminate). Document.

TDD (offline, CPython twin): `import js`/`import pyodide_js`/`import pyodide` →
runtime error containing the block message; normal imports (`math`), `ast` path
(`parseAndMatch`), stdin/entrypoint, and a follow-up run all stay green.

## B. memory cap (finding B)

Defect: 600 MB allocated under `memoryMb: 256` — cap silently unenforced (documented
deferral in `pyodide-worker.ts`).

Pyodide 0.27.2 facts: `loadPyodide` accepts no `WebAssembly.Memory` → no true
pre-allocated hard cap without a custom emscripten build. Strongest honest enforcement:

1. **Preemptive grow-guard** (primary): after `loadPyodide`, grab the emscripten
   `Module.wasmMemory` (probe `pyodide._module.wasmMemory`); shadow its `grow` with a
   wrapper that refuses growth past the current run's `memoryMb` (emscripten's
   `_emscripten_resize_heap` calls `wasmMemory.grow`; refusal → malloc fails → Python
   raises `MemoryError` inside the run — a visible, in-run failure).
2. **Post-run watermark** (fallback/belt): after every run check
   `pyodide._module.HEAPU8.length` against the cap.
3. If the guard fired or the watermark is over cap: the run FAILS visibly — result is
   forced to `ran:false` + `error:{type:"runtime", message:"memory limit exceeded …"}`
   (within the frozen shape) — and the worker is recycled: the wire `ResultMessage`
   gains an internal `recycle?: boolean` (protocol.ts is ours, NOT the frozen schema);
   `WorkerHost` marks itself dead + terminates after resolving; `sandbox.run`'s existing
   `host.state === "dead" → pool.discard` path spawns a replacement (self-healing, same
   as the watchdog). Per-run cap = `req.memoryMb` (set before each run, reset after).
4. Truthfulness limits (documented): the wasm heap never shrinks, so the cap binds heap
   *growth*; allocations served from already-grown free pages under a smaller per-run cap
   are not attributable. Pool admission (`req.memoryMb > pool cap → dedicated worker`)
   keeps pooled runs ≤ the init cap.

TDD (mock worker): recycle flag → host dead + worker terminated + result resolved;
pooled recycle → discard + respawn + next run green. Real enforcement proven in-browser.

## C. Real-browser evidence (mandatory)

- Extend `verification/debt1.js`: check 5 → real assertions (both FFI imports fail with
  the block message; `pyodide`/`run_js` unreachable; JsProxy sweep of `sys.modules`
  during a run is empty; parseAndMatch + a follow-up normal run green on the same pool).
  Check 11 → real assertions (600 MB under 256 → structured runtime "memory limit"
  failure, not success/hang; follow-up run green; pool back to 2).
- Re-run debt1 (headless Chromium, `python3 -m http.server 8765`, CDN Pyodide 0.27.2);
  update `verification/evidence/debt1.json`. All other checks must stay PASS.
- Re-run `node verification/run-debt5.mjs` — client walkthrough must stay 8/8.

## Gates (paste real output)

- `pnpm --filter @trellis/sandbox typecheck|lint|test|build` green; full `pnpm -r test`
  (423 + new); `content/validate.py` + `content/verify/harness.py` PASS.
- `git diff main...HEAD --stat` touches only `packages/sandbox/**`, `verification/**`,
  this plan. Rebase on `main` if moved; REPORT, do not merge.
