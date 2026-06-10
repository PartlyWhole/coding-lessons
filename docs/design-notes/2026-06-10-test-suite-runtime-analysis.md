# Test-suite runtime analysis (2026-06-10, rev 2)

**Status:** analysis only — queued, not implemented. Measured against `main` @ `750a0c9`
(workspace 534) on the local dev machine (Darwin arm64, 8 logical / 4 performance cores,
`/usr/bin/python3`). Rev 2 supersedes rev 1 after a critical re-measure: rev 1
misattributed the dominant cost and proposed an unsafe fix (details in "Corrections").

## Headline measurements (all verified runs, same HEAD)

| Run | Wall | CPU |
|---|---|---|
| `pnpm test -- --force` (default, 8-way package parallelism) | **3m11.8** | 244% |
| `pnpm test -- --force --concurrency=2` | **2m11.6** | 317% |
| `vitest run test/m4-concat-e2e.test.ts` solo (integration-tests) | **5.7s** (39.8s in default suite) |

Incremental runs are cheaper (turbo cache skips untouched packages); the forced numbers
are the worst case and what CI pays.

## Finding 1 — oversubscription is the suite-level killer (measured 7×)

Default run = up to 8 packages' vitest processes × ~8 forks each ≈ 64 workers on
8 cores, plus tsc builds, all spawning CPython (`spawnSync` pins workers while waiting).
Per-package effect of capping turbo at `--concurrency=2`, no code changes:

| Package | default | c2 |
|---|---|---|
| integration-tests | 157.8s | 101.9s |
| authoring | 117.5s | 51.3s |
| client | 95.7s | 31.3s |
| sandbox | 21.7s | 3.9s |
| engine | 17.2s | 3.5s |
| persist | 10.1s | 1.4s |

The rev-1 "vitest startup overhead" line item was this same artifact (engine collect
29.6s under load → 3.0s capped; m4 solo collect 307ms). It is NOT a real cost worth
chasing separately.

## Finding 2 — the remaining critical path is CPython spawn overhead

The offline twin (`packages/sandbox/src/local-cpython.ts`) spawns a fresh
`python3 -c <harness+code>` per `run()`, via blocking `spawnSync`. Measured ~31–37ms
per round trip idle. Spawn counts are modest but the cost dominates *solo* time:
the m4 e2e file does exactly **137 spawns** (counted via a PATH-shim wrapper) ≈ 5.1s
of its 5.7s solo wall — ~90–99% spawn overhead. A green evaluate ≈ ~100 runs
(bare run + test cases + property `numCases` 40–50 × learner+oracle; fail paths
short-circuit, which is why wrong-submission tests are ~1s).

After the concurrency cap, integration-tests (101.9s — `differential.test.ts` is the
big one) + authoring (51.3s — gate fixtures/differential/cli) remain the critical
path, and they are spawn-bound. pygame steps pay `import pygame` per spawn on top.

## Finding 3 — the content gates have a SECOND spawn-per-run python bridge

The authoring gates are nine (PROCESS.md numbering): 1 schema, 2 referential, 3 dag,
4 granularity, **5 fixtures (exec)**, **6 oracle (exec)**, 7 golden, 8 answerable,
9 correct-choice-miscon — plus 3 lints (`gates/run.ts`). Only 5/6 execute python, and
they do it through `packages/authoring/src/ast/python.ts` — an **independent**
`spawnSync("python3", [script])` bridge (ast_dump/runCase per fixture), NOT the
sandbox twin. Measured: gate 5 solo = **8.5s, 163 spawns** (~50ms each; 45.8s under
default-suite contention). `cli.test.ts` (full gate run incl. exec gates) = 102.5s
default / inside authoring's 51.3s at c2.

Consequences:
- Fixing `local-cpython.ts` alone does NOT speed up the gates — the authoring bridge
  needs its own fix (see fix 3 below; batching fits gates better than a warm server).
- Gate cost scales with misconceptions × fixtures — the content-track full-curriculum
  rebuild will grow this corpus, so gate latency compounds over time. The build-track
  suite impact is secondary once concurrency is capped (8.5s solo vs 45.8s contended);
  the lasting case for the gate fixes is the CONTENT track's interactive
  edit→validate loop and the CI content gates.
- For structural-only iterations, `runExecGates: false` / CLI `--no-exec` already
  skips 5/6 — worth surfacing to content-track authors for inner-loop edits.

## Recommended fixes, ranked (rev 2)

1. **Cap concurrency (config-only, measured −60s).** e.g. root script
   `"test": "turbo run test --concurrency=2"` or per-heavy-package vitest
   `maxWorkers`. `--concurrency=2` was a first guess, not a tuned optimum — sweep
   1/2/3 (and vitest worker caps) before pinning; CI runners have different core
   counts and should be measured there too. Zero semantic risk.
2. **Persistent warm-server twin (NOT fork; attacks the remaining ~150s).**
   A long-lived CPython child reading length-prefixed JSON requests on stdin,
   calling `__trellis_run` per request, replying on stdout; async `spawn`, not
   `spawnSync`. Recycle on a memory watermark, mirroring the warm pool.
   - **Fidelity: this is MORE production-faithful than process-per-run.** The harness
     (`run-harness.ts`) is explicitly designed for reused warm workers — fresh
     `ns = {}` per call, js-FFI blocklist armed/disarmed around each run, "the NEXT
     run on a reused warm worker" is in its contract comments. Production Pyodide
     reuses workers until the memory cap. Cross-run `sys.modules` persistence under
     reuse matches production semantics.
   - **pygame:** imported once per worker = same as Pyodide loading pygame-ce once;
     fixes the per-spawn import cost in m65-style tests for free.
   - **Timeout handling** needs care: per-request watchdog kill + respawn replaces
     `spawnSync`'s `timeout` option (the twin must still return `timedOut: true`
     deterministically).
   - **Acceptance gate (self-proving):** `integration-tests/test/differential.test.ts`
     and `authoring/test/gate-fixtures.differential.test.ts` are the twin-fidelity
     checks and must stay green. Full repo gate FOREGROUND before claiming done.
   - Scope: the sandbox twin only. The gate bridge gets a different (simpler) fix —
     see (3).
   - Landing zone with (1)+(2)+(3): plausibly **~45–60s** suite (client ~31s and real
     python exec become the floor); treat as estimate, re-measure.
3. **Batch the gate bridge** (`authoring/src/ast/python.ts`, exec gates 5/6).
   Gates are batch-shaped: the whole fixture corpus is known up front, the executed
   code is trusted authored content (not adversarial learner code), and per-case
   order doesn't matter. So instead of a warm server: `gateFixtures`/`gateOracle`
   collect all case specs and make ONE `python3` invocation taking a JSON array and
   returning an array (fresh `ns = {}` per case inside, harness-style). Gate 5:
   163 spawns → ~2; est. 8.5s → well under 1.5s (python exec of teaching-sized
   snippets is milliseconds).
   - **Per-case timeout INSIDE the batch driver** (SIGALRM or chunking) so one
     runaway fixture fails that case rather than hanging the whole batch (current
     contract: 30s per-spawn timeout).
4. **Fixture-level gate-result caching** (follow-on; the lever that compounds).
   A gate result is a pure function of (fixture code, detector spec, gate-script
   hash, python version) — a content-hash keyed disk cache makes the content-track
   edit→validate loop re-execute only touched fixtures, and a restored CI cache makes
   content-PR gate runs pay only for the diff. Value GROWS with the curriculum
   rebuild's corpus; batching alone stays linear in corpus size. Invalidate on
   script hash + python version; keep the cache out of the corpus-correctness story
   (a cold run must reproduce identical results — cache is a pure memo).
5. (Minor, only if still warranted after 1–4): suite-wide oracle memoization
   (`referenceImpl+seed+args` is deterministic, but vitest forks don't share memory —
   needs a disk cache; weigh complexity), vitest workspace/`isolate:false` for pure
   packages (audit module-state mutation first), async+pooled gate pass (subsumed
   by (3) if batching lands).

## Corrections from rev 1 (for the record)

- Rev 1 claimed "~15 min of CPU is interpreter startup" and estimated fork-server
  alone → ~1m suite. Wrong attribution: the in-suite per-file times carried a ~7×
  contention multiplier (m4: 39.8s in-suite vs 5.7s solo, identical code). Spawn
  overhead is real but is the *solo floor*, not the suite multiplier.
- Rev 1 proposed `os.fork()` per request. Rejected: fork-without-exec on macOS is
  unsafe once Apple frameworks/SDL are loaded (the reason CPython multiprocessing
  defaults to `spawn` on darwin), it's worst-case for pygame, and process-per-run
  freshness was never the production contract anyway (warm workers are reused).

## Execution constraints (when picked up)

- Concurrent-orchestrator era: build in an isolated worktree pinned to a commit;
  deliver a branch + handoff, build orchestrator integrates (only merger to `main`).
- Re-baseline timing at integration if heavy work has landed since `750a0c9`.
