# Trellis — Implementation Plan (M0–M5 Working Slice)

**Status:** Approved for planning · **Date:** 2026-06-08
**Source of truth:** [`TECHNICAL_DESIGN.md`](../../../TECHNICAL_DESIGN.md) — the architecture, schemas, and milestone roadmap (§16) are settled there. This document does **not** re-decide design; it turns §16's M0–M5 into an executable, test-first build plan, locks the library choices the design left implicit, and defines how each unit is verified before the next begins.

## 1. Scope

**In scope:** the complete deterministic machine running on the proving slice — the Output → Variables → String-Concat spine plus the `random` extension — minus telemetry, the pygame graphical runtime, and offline/a11y hardening. This corresponds to design milestones **M0 through M5**.

**The slice's end state (M5 acceptance):** a real learner walks Output → Variables → String-Concat → hits the str/number coercion misconception (`mis.concat.str_num`) → climbs the learner-dosed hint ladder → passes; **and** the `random` extension visibly unlocks once its prerequisites are mastered (the availability diff) — with mastery surviving a page reload, served from `python -m http.server` with zero server logic.

> **Proving-slice realignment (post-content authoring).** The original design (§16) made `string_concat` itself the `track: extension` proving node. The authored content instead realized `string_concat` as **spine** (it's backbone — `node.input` requires it) and `random` as the `track: extension` node (one `kind: track` edge to `skill.var.assign`). That is the more architecturally stable shape, so this plan adopts it: **string_concat stays spine; `random` is the node that proves the extension-unlock/gating mechanic.** Two consequences the M1/M2 plans must finalize against the content's actual `minMastery` values (not guessed here): (a) the M2 gating-diff test targets `random`'s unlock rather than string_concat's; (b) an **architectural invariant** is adopted — *extensions depend on the spine; the spine never depends on an extension* — which flags the authored `node.conditionals` (spine) `requires skill.random.randint` (from the `random` extension) as a violation to resolve during M1 (either drop that requirement so `random` is genuinely optional, or promote `random` to spine if it is truly core). This is a curriculum-intent call, surfaced here, not silently rewritten.

**Explicitly deferred (not this plan):**
- M6 — `@trellis/telemetry`, behavior logging, proactive scaffolding (§11)
- M6.5 — `@trellis/runtime`, pygame graphical build steps (§17)
- M7 — service-worker offline precaching, export/delete-my-data, WCAG-AA pass, authoring preview harness, iOS Safari validation (§14)

These are referenced only where M0–M5 must leave a clean seam for them (e.g. the `EventBus` emit sites, the `runtime?: "pygame"` field, the `LanguageAnalyzer` interface).

## 2. Cross-cutting technical decisions

These are the implementation-level choices the design left to the builder. Each is locked for this plan.

| Concern | Decision | Rationale |
|---|---|---|
| Schema definition | **TypeBox** — one definition per §3 type | Yields the TS type (`Static<typeof T>`), the JSON Schema (the definition *is* the schema), and runtime validation (`Value.Check` / `Value.Errors`) from a single source. Directly satisfies §2's "schemas are shared types, not duplicated." |
| Runtime validation | TypeBox `Value` checker | No second validator to maintain; same schema gates the content compiler and any runtime decode. |
| Monorepo / build | **pnpm workspaces + Turborepo** | Per §2. |
| Test runner | **Vitest** | Fast, TS-native, ESM-native; works for pure-engine unit tests and worker/IndexedDB integration tests (jsdom / happy-dom + fake-indexeddb where needed). |
| Client bundler | **Vite + React 18** | Per §2. |
| `recall` / pattern matching | **`re2js`** (pure-JS RE2 port) at runtime + a compile-time pattern lint in the content compiler | The design hard-requires RE2 (linear-time, no catastrophic backtracking) for `AcceptedAnswer.patterns`. Native RE2 isn't in browsers, and we must not boot Pyodide to grade a text answer. `re2js` gives the linear-time guarantee in pure JS. Reversible: a `wasm-re2` swap is local to one module. |
| Code editor | **CodeMirror 6** | Accessible, screen-reader-friendly (§14), and supports read-only ranges that `lockedRegions` (§3.4) will need when pygame lands. M0–M5 uses plain editable buffers. |
| Python sandbox | **Pyodide**, single pinned version, loaded from CDN, **in a Web Worker** | Per §6.1. Kill switch is `worker.terminate()` + a warm replacement pool — the interrupt-buffer mechanism is unavailable because it needs a `SharedArrayBuffer` and thus COOP/COEP headers, which GitHub Pages cannot set (§17.1). |
| Methodology | **Test-first per unit** | The determinism guarantee (§1) makes every engine function pure and reproducible; the design already mandates fixtures (misconception triggers/non-triggers, golden Diagnosis snapshots, reference-impl agreement). Tests are written before implementation for each unit. |

## 3. Packages

In scope for M0–M5 (per §2, minus the deferred ones):

```
@trellis/schema      all §3 types as TypeBox → TS types + JSON Schema + Value validation
@trellis/engine      pure TS: resolver · stepMachine · evaluate · detect · diagnose · hintSelect · learnerModel
@trellis/sandbox     Pyodide Web Worker grader (run/timeout/memory/AST), the injected Sandbox adapter
@trellis/persist     IndexedDB adapter (idb), atomic commitSubmission
@trellis/content     authored YAML for the proving slice + compiled bundle output
@trellis/authoring   the compiler/validator CLI (trellis lint / build / grade) and the §13.2 gates
@trellis/client      React 18 + Vite app: CellRunner, step views, editor, hint panel, peek-back
```

**Not created in this plan:** `@trellis/telemetry` (M6), `@trellis/runtime` (M6.5), `@trellis/server` (never — §15).

**Purity boundary (load-bearing, §12):** `@trellis/engine` imports no React, no IndexedDB, no `fetch`, no Pyodide. Its effectful dependency (the `Sandbox`) is injected. This is what keeps it exhaustively unit-testable and is enforced by an import-lint in CI.

## 4. Build units and verification gates

Each unit is built test-first and is not considered done until its gate passes. M3 from §16 is split into **M3a** (sandbox host) and **M3b** (build ladder) because the worker lifecycle/kill-switch and the grading ladder are independently testable and are the riskiest part of the slice.

### M0 — Schema & monorepo foundation
- **Build:** pnpm + Turbo workspaces; `@trellis/schema` with every §3 type as a TypeBox definition exporting both the schema and `Static<>` TS type; Vitest + CI wired; import-lint rule reserving engine purity.
- **Gate:** all types compile; a sample content fragment and a sample `Diagnosis`/`LearnerModel` round-trip through `Value.Check` (accept valid, reject malformed with a useful error path).

### M1 — Content compiler & graph validation (`@trellis/authoring` + `@trellis/content`)
- **Build:** YAML source → immutable, content-addressed JSON bundle + derived indexes (`producers`, `requirements`, §4.1). The seven §13.2 gates: (1) schema validity, (2) referential integrity, (3) DAG + spine connectivity + extension single-track edge (§4.2), (4) granularity lint (≥1 certifying step, ≥1 misconception, warn >6), (5) misconception fixtures run through the real detector, (6) reference-impl agreement vs. fixed tests, (7) golden Diagnosis snapshots. CLI: `trellis lint`, `trellis build`, `trellis grade <step> <file>`. Compile-time RE2 pattern lint lives here.
- **Content authored:** the Output → Variables → String-Concat spine nodes + the `random` extension (the realized slice; see the realignment note in §1), in YAML per §13.1. (The authored corpus already exists under `content/`; M1 validates and compiles it.)
- **Gate:** the proving-slice content compiles to a bundle; a deliberately-cyclic fixture **fails** the build with the offending path reported; a dangling-id fixture fails; the extension's single `kind: track` edge validates (and the spine-never-requires-an-extension invariant is linted — flagging the `conditionals → random.randint` edge per §1).
- *Note:* gates 5–7 depend on the detector (M4) and sandbox (M3); they are stubbed/skipped in M1 and switched on as those units land. The compiler is structured so these gates plug in without rework.

### M2 — Pure engine core (`@trellis/engine`, no sandbox)
- **Build:** `resolveAvailability` + `nextSpineCell` (§4.3); the step lifecycle machine for `watch`/`recognize`/`recall`/`predict` (§5.1) with keyed-replacement semantics expressed as pure transitions; non-build `diagnose` (§8) including `recall` normalization + `re2js` patterns + `misconceptionMap`; `detect` (§7); `applyDiagnosis` + continuous mastery update (§10.2); the upstream-skill targeter (§10.3).
- **Gate:** the gating diff on the `random` extension — with one prerequisite mastered but the other not, `random` stays `locked`; mastering both flips it to `available` (the availability *diff* that powers "you just unlocked X"). (Exact prerequisite pair finalized in this plan against the content's `minMastery` values.) Non-build attribution precedence is unit-tested (`pass`/`misconception`/`mismatch`). Same `(step, signals)` → identical Diagnosis, always.

### M3a — Sandbox host (`@trellis/sandbox`)
- **Build:** Pyodide loaded in a Web Worker from a pinned CDN URL; the `Sandbox.run` contract (§6.1) — fresh Python namespace per call, stdout/stderr capture, `WebAssembly.Memory` cap, structured-clone-only boundary, no `js` FFI. Host-side watchdog: arm a timer, `worker.terminate()` on expiry, spin up a replacement; a small warm pool hides respawn latency.
- **Gate:** a warm trivial run completes well within budget; an infinite-loop submission is killed by the watchdog and surfaces as a timeout (not a hung tab); a syntax error and a runtime error are reported with type + line; cold warm-up state is observable (for the runner's "warming…" UI).

### M3b — Build ladder (`@trellis/engine` `evaluate` + sandbox)
- **Build:** `evaluate` running Run → Test → AST → Property (§6), short-circuiting per §6/§8. Test runner with `deep-equal`/`float-close`/`set-equal` comparators (§6.2); AST analysis via Python's own `ast` in the sandbox, matching the declarative `AstQuery` language → tags (§6.3); property-based testing with a **seeded PRNG**, bounded generators, and shrinking to a minimal counterexample (§6.4); `acceptedVariants` handling.
- **Gate:** a correct-but-unanticipated solution passes — `f'age: {age}'` **and** `'age: ' + str(age)` both pass via the reference-impl oracle + property test; AST tags attach to failing solutions only (or pass-compatible style); same `(submission, EvaluatorConfig, seed)` → identical signals and identical counterexample.

### M4 — Misconception + hints end-to-end
- **Build:** wire the concat taxonomy — `implicit_coercion` signature (`runError: runtime` OR `astTag: implicit_coerce`) → attribution `misconception` → authored feedback → 4-level learner-dosed hint ladder (§9) with `autoEscalate` on repeat and reset-on-new-misconception. Turn on §13.2 gates 5–7 in the compiler now that the detector and sandbox exist.
- **Gate:** `'age: ' + age` yields the **right** misconception id, the **right** feedback, and a pullable ladder where each press reveals exactly one more level (level 4 behind a confirm); the fixture-runner gate is green for the slice; the same submission always yields the same Diagnosis.

### M5 — Presentation slice (`@trellis/client` + `@trellis/persist`)
- **Build:** `CellRunner` with React-keyed step replacement (unmount/remount per `StepId`, §5.2); step views for all five kinds; CodeMirror editor pane; attribution-colored `FEEDBACK` state; hint panel (pull/dose, §9.2); read-only peek-back panel reconstructed from history (§5.3); `@trellis/persist` over IndexedDB (`idb`) with the single atomic `commitSubmission` transaction spanning `learner_skill` + `diagnosis` + `behavioral_event` (§3.10) — the events store exists and is written to, even though M6 telemetry isn't built; content loaded via a static `fetch` of the bundle, cached by `contentVersion`. The `EventBus` emit seam (§11.1) is stubbed (emit sites present, no subscriber) so M6 attaches cleanly.
- **Gate (whole-slice acceptance):** the full learner walkthrough above completes end-to-end, mastery + history survive a page reload (IndexedDB), and the app runs served from `python -m http.server` with no server logic.

## 5. Dependency order and risk

```
M0 ─▶ M1 ─▶ M2 ─┐
      │         ├─▶ M4 ─▶ M5
      └▶ M3a ─▶ M3b ┘
```

- M1 and M2 both depend only on M0 and can overlap; M1's gates 5–7 wait on M3b/M4.
- **M3a is the highest-risk unit** (worker lifecycle, the terminate-based kill switch, cold-start budget, browser quirks) and is isolated precisely so it can be hardened independently before the ladder sits on it.
- M5 depends on everything; its acceptance test is the slice's definition of done.

## 6. Out-of-scope seams to preserve

To keep the deferred milestones from becoming rewrites:
- **Telemetry (M6):** `@trellis/persist` includes the `behavioral_event` store and `appendEvents`/`recentEvents` now; the client emits `UiEvent`s onto a stubbed `EventBus`. M6 attaches a `Recorder` subscriber — no emit-site changes.
- **Pygame (M6.5):** the `runtime?: "pygame"` field and `lockedRegions` exist in the schema; CodeMirror is chosen partly for read-only ranges; `evaluate` is language-agnostic over `RunResult` + `astTags`.
- **Backend (never in v1, §15):** the engine stays pure with injected effects; adding a server later swaps adapters, not engine code.

## 7. Non-goals for this plan

No telemetry, no pygame, no service worker / offline, no accessibility audit beyond using accessible components, no authoring GUI, no multi-language support, no cross-device sync, no spaced-repetition scheduler. All are design-acknowledged deferrals (§15, §16 M6–M7).
