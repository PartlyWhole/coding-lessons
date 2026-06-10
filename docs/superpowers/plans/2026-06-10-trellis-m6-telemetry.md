# Trellis M6 — Behavior Logging & Proactive Scaffolding (`@trellis/telemetry`) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement TECHNICAL_DESIGN.md §11 (11.1–11.4): a self-contained `@trellis/telemetry` adapter package that turns the client's already-wired `UiEvent` bus into a durable `behavioral_event` stream in persist, plus a deterministic headless `ProactiveScaffolder` — attached to the app with one line and **zero emit-site changes**.

**Architecture:** Telemetry is an effectful adapter (§12) beside sandbox/persist. The inbound seam is the existing `EventBus` (real pub/sub, zero subscribers today); the outbound seam is `persist.appendEvents`/`recentEvents`, injected as a narrow port so telemetry never imports `@trellis/persist`. The `UiEvent`/`EventBus` contract **moves into `@trellis/telemetry`** and the client re-exports it (a type-import change, not an emit-site change). All effects (clock, uuid, visibility listeners) are injected.

**Tech Stack:** TypeScript ESM workspace (pnpm + turbo), TypeBox-derived types from `@trellis/schema`, vitest, Playwright harness under `verification/`.

---

## 0. Pinned decisions (the START-HERE §2 questions — resolved here)

### D1 — Type-ownership seam (START-HERE §2.1)

`UiEvent` + `EventBus` + `createEventBus` currently live in `packages/client/src/eventBus.ts`. The client is the top leaf; telemetry must not import it. **Decision: the whole module — types AND the `createEventBus` implementation — moves into `@trellis/telemetry` (`packages/telemetry/src/bus.ts`). `packages/client/src/eventBus.ts` becomes a pure re-export shim:**

```ts
// packages/client/src/eventBus.ts — the contract now lives in @trellis/telemetry (§11.1).
export type { UiEvent, EventBus } from "@trellis/telemetry";
export { createEventBus } from "@trellis/telemetry";
```

- Every client import site says `from "../eventBus.js"` / `"./eventBus.js"` and keeps compiling unchanged → **zero emit-site changes** (the bus *variable* in `TrellisApp.tsx` doesn't move either).
- Why the impl moves too (justification per START-HERE): the bus's defining invariant — *emit never throws into the caller* — is telemetry's own defining gate (d). One owner, one implementation, one test suite; leaving a second impl in the client would be a drift hazard.
- New dependency edge: `@trellis/client` → `@trellis/telemetry` → `@trellis/schema`. No cycle (telemetry imports nothing from client, persist, engine, sandbox, react, or the DOM).
- **NO schema change** — §11.1 is explicit that schema does not export `UiEvent`.

### D2 — Ports, not imports (persist + clock + uuid + DOM)

`TelemetryRecorder.attach(deps)` receives narrow injected ports; telemetry's `package.json` depends **only** on `@trellis/schema`:

```ts
// telemetry-owned port; the CLIENT binds it to a TrellisDb (it already imports persist).
export interface TelemetryPersist {
  appendEvents(events: BehavioralEvent[]): Promise<void>;
  recentEvents(q: { stepId?: string; limit?: number }): Promise<BehavioralEvent[]>;
}

export interface Clock {
  now(): number;                                  // epoch ms (Date.now) — ts must be ISO-8601 wall time
  setTimer(fn: () => void, ms: number): Timer;    // arg order matches packages/sandbox/src/clock.ts precedent
  clearTimer(t: Timer): void;
}

// The ONLY DOM touch (START-HERE §2.5 exception): visibility/pagehide listeners via an injected target.
export interface ListenerTarget {
  addEventListener(type: string, fn: () => void): void;
  removeEventListener(type: string, fn: () => void): void;
}
```

Note: §11.1's pseudo-interface writes `setTimer(ms, fn)`; we follow the repo's existing `packages/sandbox/src/clock.ts` convention `setTimer(fn, ms)` (telemetry defines its own copy — adapters stay independent; sandbox's `realClock` uses `performance.now`, ours must use `Date.now` because `BehavioralEvent.ts` is wall-clock ISO).

### D3 — Recorder mapping table (UiEvent → BehavioralEvent, §3.9 `SignalType`)

`SignalType` (packages/schema/src/ids.ts) literals: `session_start, step_enter, step_release, focus_change, submission, run, editor_change, rapid_resubmit, idle, dwell, three_fail_streak, wrong_predict_then_correct_run, hint_requested, peek_back`.

| UiEvent `t` | rows | `type` | payload |
|---|---|---|---|
| `session_start` | 1 | `session_start` | `{}` — `stepId: ""` sentinel (BehavioralEvent.stepId is required; no step is active yet; `""` never collides with a real StepId and never matches a `by_step_ts` query) |
| `step_enter` | 1 | `step_enter` | `{ kind }` |
| `step_release` | 1 | `step_release` | `{}` |
| `submission` | 1 | `submission` | `{ correct, attribution, misconceptionId?, stepKind, failStreak, editLength?, editHash?, editDistanceProxy?, msSinceLastSubmission? }` — derived fields stamped at record time (§11.2) by `SignalDeriver`; **never** raw code |
| `predict_answer` | **0** | — | folded: the concurrent `submission` row already carries `stepKind: "predict"` + `correct` (the Recorder tracks the active step kind from `step_enter`). See escalation E4 — no `predict_answer` literal exists in `SignalType`; this mapping needs no schema change. |
| `run` | 1 | `run` | `{}` |
| `editor_change` | 1 (debounced upstream) | `editor_change` | `{ length, hash }` |
| `hint_request` | 1 | `hint_requested` *(literal differs from the UiEvent tag — deliberate)* | `{ level }` |
| `peek_back` | 1 | `peek_back` | `{}` |
| `focus` | 1 | `focus_change` | `{ focused }` |
| *(IdleDetector, not a UiEvent)* | 1 | `idle` / `dwell` | `{ durationMs }` |

Stamping: per-page-load `sessionId` (uuid), monotonic **gap-free `seq`** assigned at row-creation time (not flush time — ordering survives batching), `ts = new Date(clock.now()).toISOString()`, `learnerId` from deps, `id` from injected `ids.uuid()` (default `crypto.randomUUID`).

### D4 — `SignalDeriver` semantics (pure; §11.2)

- `failStreak`: consecutive `correct === false` submissions on the current step (resets on correct or `step_enter`).
- `editDistanceProxy`: exact edit distance is **impossible** under the default `captureEditorText: false` (only length+hash exist — by design). Pinned proxy: consecutive-submission buffers with **equal hash → 0**; else **`|Δlength|`** (a lower bound on true edit distance). The Recorder keeps the last `editor_change` `{length, hash}` per step in memory and snapshots it onto each submission row. `rapid_resubmit`'s `editDistance < 5` evaluates against the proxy; when no `editor_change` data exists (escalation E2 unlanded) the proxy is absent and the rule **cannot fire** — deterministic, never a guess.
- predict→run correlation: derivable from persisted rows (`submission` with `payload.stepKind === "predict"` followed by a later correct `submission`/`run` on the paired step) — pure function over an event list.
- Same events in → same signals out: no clock, no randomness, no I/O in this module.

### D5 — ProactiveScaffolder: **headless + design escalation ⚑** (START-HERE §2.3)

**Greenhouse survey result (docs/design/greenhouse/ — components/{core,code,feedback}, design/ artboards, guidelines/, deliverables/trellis-design-handback.md):** the component inventory is Button, ChoiceOption, ProgressPips, TextInput, CodeBlock, EditorFrame, FeedbackBand, HintLadder. There is **no non-modal nudge / toast / check-in / proactive-offer pattern anywhere** (greps for stuck/nudge/proactive/non-modal/toast/snackbar/banner/check-in across the whole design tree: zero hits; the handback's only "toast" mention is "no shake, no toast" for locked-region rejection). HintLadder is strictly learner-pulled; FeedbackBand is post-submission attribution. **Verdict: no suitable pattern exists → build the rules engine + a headless action-proposal seam now, and ESCALATE the visual affordance for a design ⚑ (E5). We do NOT invent new visual language.**

One carve-out, pinned: **`three_fail_streak` ships end-to-end without design sign-off** because its action — auto-advance the hint ladder by exactly one level — renders entirely through the *existing* HintLadder reveal state (the client wires the proposal to the existing `pullHint()` path; visually identical to a learner pull; zero new visual language). The other three rules' proposals are recorded/exposed headlessly (`onAction` callback) and surface nothing until design lands.

Frozen dosage rules (restated so the implementer can't miss them): proposals are **suggestions only**; only `three_fail_streak` may auto-advance the ladder, **by exactly one level**; never reveal beyond one level; highest-priority firing rule wins (`wrong_predict_then_correct_run` > `three_fail_streak` > `rapid_resubmit` > `idle`); thresholds (20s, 90s, 3 fails, distance 5) are config with those defaults.

Scaffolder mechanics: subscribes to the same bus; evaluates the submission-driven rules on each `submission` event by reading back `persist.recentEvents({ stepId })`; owns its own `IdleDetector` instance (same injected clock) for the `idle` rule; dedupes — a given `(rule, stepId)` proposal fires at most once until a new submission or `step_enter` on that step resets it.

### D6 — Privacy (§11.4)

- `CapturePolicy` defaults: `{ enabled: true, captureEditorText: false, idleThresholdMs: 90_000, editorDebounceMs: 400 }`.
- `policy.enabled === false` → `attach()` **never subscribes anything** and returns a no-op detach (master switch = one subscription toggle; gate (e) asserts zero rows).
- `captureEditorText: false` → no raw editor text in any persisted row, ever (gate (e) string-scans flushed rows for planted source text). Note: `editorDebounceMs` is policy the *emit site* will consume when E2 lands; telemetry records `editor_change` events as they arrive.
- Nothing leaves the device: telemetry's only sink is the injected `TelemetryPersist` port (→ IndexedDB). No fetch, no endpoint, no import that could transmit.
- Retention TTL sweep (§11.4 "startup sweep deletes rows older than a TTL") requires a delete-by-age persist API that does not exist (`appendEvents`/`recentEvents` only) — **out of scope; noted in E6** rather than silently extending the frozen persist seam.

### D7 — EventBuffer

Batches rows; flushes when: size ≥ `maxBatch` (default 20), interval timer fires (default 5_000 ms, armed only while non-empty, via injected clock), or the injected `ListenerTarget` fires `visibilitychange`(→ check hidden via injected `isHidden()`)/`pagehide`. Flush = hand the batch to `persist.appendEvents` (one txn — already batched in persist). A pagehide flush is necessarily best-effort (async IndexedDB during unload); rows are removed from the buffer only after `appendEvents` resolves, and a failed flush re-queues at the front (no loss, no reorder — `seq` already stamped). No write-per-keystroke by construction.

---

## 1. Escalations (orchestrator-facing; none block Phase-2 start)

| # | Finding | Impact | Proposed resolution (NOT ours to apply) |
|---|---|---|---|
| **E1** | **Missing `run` emit site.** §11.1's diagram lists PygameStage as an emitter; `packages/client/src/steps/PygameStage.tsx` has Run / "Run & check" buttons but never emits `{t:"run"}` (it never receives the bus). No `run` emit exists anywhere. | `run` rows never recorded; predict→run correlation degraded for pygame steps; idle detector blind to Run presses. | Orchestrator lands the emit (bus or callback prop threaded from `CellRunner`) on `main`; telemetry consumes it with zero change. |
| **E2** | **Missing `editor_change` emit site.** Diagram lists EditorPane; neither `EditorPane.tsx` (`onChange` only) nor `useCellRunner.setBuildCode` emits the debounced `{t:"editor_change", length, hash}`. | `editor_change` rows never recorded; **`rapid_resubmit` can never fire** (no editDistance proxy, D4); IdleDetector won't see typing → **`idle` can false-fire during active typing**. Load-bearing for two of the four §11.3 rules. | Orchestrator lands a debounced (`policy.editorDebounceMs` = 400 ms) length+hash emit at the `setBuildCode` boundary. |
| **E3** | **Missing `focus` emit site.** No `{t:"focus", stepId, focused}` emit anywhere in the client. | `focus_change` rows never recorded (§11.2 lists focus changes as a captured signal). | Orchestrator decides owner (window focus/blur in app shell vs. editor focus). |
| **E4** | **`SignalType` has no `predict_answer` literal** (schema §3.9, `packages/schema/src/ids.ts`), but `UiEvent` has `predict_answer`. | Resolved without schema change by D3's fold (predict outcome lives on the `submission` row payload). Flagging because the orchestrator may prefer an explicit literal instead. | Accept D3 fold (recommended — zero schema change), or orchestrator adds the literal on `main` test-first. |
| **E5** | **Design ⚑: no Greenhouse pattern for the proactive non-modal affordance** ("stuck? peek back or take a hint" / "want a hint?" / misconception level-1 offer). Survey detail in D5. | Three of four scaffold actions stay headless until design lands. `three_fail_streak` ships visually via the existing HintLadder reveal (D5 carve-out — needs orchestrator nod, not design). | Design pass produces the affordance (suggested family: a quiet FeedbackBand-adjacent inline row, NOT a modal/toast); client wiring is then a follow-up stream. |
| **E6** | **Persist has no delete-by-age API** for the §11.4 retention TTL sweep (the seam is `appendEvents`/`recentEvents` only). | TTL sweep deferred; unbounded growth is slow (events are small) but real. | Orchestrator extends persist (`pruneEventsBefore(ts)` over `by_step_ts`/a ts index) on `main`; telemetry calls it at attach time in a follow-up. |

---

## 2. File structure

```
packages/telemetry/
  package.json                 # @trellis/telemetry; deps: @trellis/schema only
  tsconfig.json                # extends ../../tsconfig.base.json (same as persist)
  vitest.config.ts             # same as persist's
  src/
    index.ts                   # public surface (types + createEventBus + attachTelemetry + createProactiveScaffolder)
    bus.ts                     # UiEvent, EventBus, createEventBus  (moved from client)
    ports.ts                   # TelemetryPersist, Clock, Timer, ListenerTarget, Ids, realClock, realIds
    policy.ts                  # CapturePolicy + DEFAULT_CAPTURE_POLICY
    derive.ts                  # SignalDeriver: pure derived-signal functions
    recorder.ts                # Recorder: UiEvent → BehavioralEvent rows (sessionId/seq/ts/payload)
    idle.ts                    # IdleDetector (injected clock)
    buffer.ts                  # EventBuffer (size/interval/visibility flush)
    attach.ts                  # attachTelemetry(deps) → detach  (the §11.1 TelemetryRecorder.attach)
    scaffolder.ts              # ScaffoldAction, ScaffoldConfig, pure rule predicates, createProactiveScaffolder
  test/
    bus.test.ts  derive.test.ts  recorder.test.ts  idle.test.ts  buffer.test.ts
    attach.test.ts             # defining gates (a)(d)(e) at unit/integration level (memoryDriver)
    scaffolder.test.ts         # defining gate (c): textbook sequences + near-miss mutations
    helpers/fake.ts            # FakeClock, FakeListenerTarget, seqIds, collectSink

packages/client/src/eventBus.ts        # becomes the D1 re-export shim
packages/client/package.json           # + "@trellis/telemetry": "workspace:*"
packages/client/src/app/TrellisApp.tsx # one-line attach (+ db.learnerId) once ready
packages/client/test/telemetryAttach.test.tsx   # NEW: app-shell attach smoke (memoryDriver)
verification/m6-telemetry.spec.ts (or harness-pattern equivalent)  # gate 5 walkthrough + IDB evidence
docs/superpowers/plans/2026-06-10-trellis-m6-telemetry.md          # this plan
pnpm-lock.yaml                          # regenerated only
```

Write-set compliance: everything above is inside START-HERE §3's exact write set (`packages/telemetry/**` new; client = type-seam shim + one-line attach + the D5-carve-out wiring if approved; `verification/**` new files; lockfile regen; plan file). Schema, persist, engine, sandbox, runtime, content, coordination docs: untouched.

---

## 3. Phase-2 task breakdown (TDD; commit per task with `-c user.name='M6-telemetry' -c user.email='noreply@anthropic.com'`)

### Task 1: Package scaffold

**Files:** Create `packages/telemetry/package.json`, `tsconfig.json`, `vitest.config.ts`, `src/index.ts` (empty export), `test/helpers/fake.ts`.

- [ ] **1.1** Create `packages/telemetry/package.json` (mirror persist's exactly, name `@trellis/telemetry`, deps `{"@trellis/schema": "workspace:*"}`, devDeps `{"vitest": "^2.1.0"}`, same four scripts).
- [ ] **1.2** Create `tsconfig.json` (copy persist's verbatim) and `vitest.config.ts` (copy persist's verbatim).
- [ ] **1.3** Create `src/index.ts` containing `export {};` and `test/helpers/fake.ts`:

```ts
// test/helpers/fake.ts
import type { Clock, Timer, ListenerTarget, Ids } from "../../src/ports.js";

export class FakeClock implements Clock {
  private t = 0;
  private timers = new Map<number, { at: number; fn: () => void }>();
  private nextId = 1;
  now(): number { return this.t; }
  setTimer(fn: () => void, ms: number): Timer {
    const id = this.nextId++;
    this.timers.set(id, { at: this.t + ms, fn });
    return id as unknown as Timer;
  }
  clearTimer(t: Timer): void { this.timers.delete(t as unknown as number); }
  /** Advance time, firing due timers in order. */
  tick(ms: number): void {
    const target = this.t + ms;
    for (;;) {
      const due = [...this.timers.entries()].filter(([, v]) => v.at <= target).sort((a, b) => a[1].at - b[1].at)[0];
      if (!due) break;
      this.t = due[1].at;
      this.timers.delete(due[0]);
      due[1].fn();
    }
    this.t = target;
  }
}

export class FakeListenerTarget implements ListenerTarget {
  private subs = new Map<string, Set<() => void>>();
  hidden = false;
  addEventListener(type: string, fn: () => void): void {
    if (!this.subs.has(type)) this.subs.set(type, new Set());
    this.subs.get(type)!.add(fn);
  }
  removeEventListener(type: string, fn: () => void): void { this.subs.get(type)?.delete(fn); }
  fire(type: string): void { for (const fn of this.subs.get(type) ?? []) fn(); }
  listenerCount(): number { return [...this.subs.values()].reduce((n, s) => n + s.size, 0); }
}

export function seqIds(prefix = "id"): Ids {
  let n = 0;
  return { uuid: () => `${prefix}-${n++}` };
}
```

- [ ] **1.4** `cd /Users/alan/Desktop/trellis-m6 && pnpm install` (workspace glob `packages/*` picks it up; lockfile regenerates — the only allowed lockfile change). Run `pnpm --filter @trellis/telemetry test` → passes (passWithNoTests).
- [ ] **1.5** Commit: `feat(telemetry): scaffold @trellis/telemetry package (§11 adapter)`.

### Task 2: Bus moves in (with its invariant tests)

**Files:** Create `src/bus.ts`, `test/bus.test.ts`. Modify `src/index.ts`.

- [ ] **2.1** Write failing `test/bus.test.ts`: (a) emit fans out synchronously to two subscribers in subscription order; (b) **a subscriber that throws does not break the emitting caller and later subscribers still run** (defining gate (d)); (c) unsubscribe handle removes exactly that subscriber; (d) emit with zero subscribers is a no-op.
- [ ] **2.2** Run `pnpm --filter @trellis/telemetry test` → FAIL (module not found).
- [ ] **2.3** Create `src/bus.ts`: **verbatim copy of `packages/client/src/eventBus.ts`** (the `StepId = string` local alias, `UiEvent`, `EventBus`, `createEventBus` — imports `StepKind`, `Diagnosis` from `@trellis/schema`). Export all three from `src/index.ts`.
- [ ] **2.4** Tests pass. Commit: `feat(telemetry): own the UiEvent/EventBus contract (moved from client, §11.1)`.

### Task 3: Client type-seam swap (D1)

**Files:** Modify `packages/client/src/eventBus.ts` (→ the D1 shim, exact content in D1 above), `packages/client/package.json` (add `"@trellis/telemetry": "workspace:*"` to dependencies).

- [ ] **3.1** Apply both edits; `pnpm install`.
- [ ] **3.2** `pnpm --filter @trellis/client typecheck && pnpm --filter @trellis/client test` → green, **zero changes in any emit-site file** (`git diff --stat` shows only eventBus.ts + package.json + lockfile).
- [ ] **3.3** Commit: `refactor(client): eventBus re-exports the contract from @trellis/telemetry (type-seam only, zero emit-site changes)`.

### Task 4: Ports + policy

**Files:** Create `src/ports.ts`, `src/policy.ts`. Modify `src/index.ts`.

- [ ] **4.1** `src/ports.ts`: `Timer`, `Clock`, `realClock` (Date.now/setTimeout/clearTimeout), `ListenerTarget`, `Ids`, `realIds` (`crypto.randomUUID`), `TelemetryPersist` — exact shapes from D2.
- [ ] **4.2** `src/policy.ts`:

```ts
export interface CapturePolicy {
  enabled: boolean;
  captureEditorText: boolean;
  idleThresholdMs: number;
  editorDebounceMs: number;
}
export const DEFAULT_CAPTURE_POLICY: CapturePolicy = {
  enabled: true, captureEditorText: false, idleThresholdMs: 90_000, editorDebounceMs: 400,
};
```

- [ ] **4.3** Typecheck green; commit: `feat(telemetry): injected ports (clock/ids/persist/listener) + CapturePolicy defaults`.

### Task 5: SignalDeriver (pure, D4)

**Files:** Create `src/derive.ts`, `test/derive.test.ts`.

- [ ] **5.1** Failing tests: `editDistanceProxy({len:10,hash:"a"},{len:10,hash:"a"})===0`; hash differs → `|Δlen|`; `failStreak` counts trailing wrong submissions and resets on a correct one; determinism (same list twice → deep-equal outputs); predict→run correlation helper finds wrong-predict-then-correct-next on a row list and rejects correct-predict and wrong-then-wrong.
- [ ] **5.2** Implement minimal pure functions; tests pass.
- [ ] **5.3** Commit: `feat(telemetry): SignalDeriver — pure derived signals (proxy distance, fail streak, predict→run)`.

### Task 6: Recorder (D3 mapping)

**Files:** Create `src/recorder.ts`, `test/recorder.test.ts`.

- [ ] **6.1** Failing tests (FakeClock + seqIds, sink = array): the full D3 mapping table row-by-row — incl. `hint_request → "hint_requested"`, `focus → "focus_change"`, `predict_answer → 0 rows` with predict info present on the submission payload (`stepKind:"predict"`, `correct`), `session_start` sentinel `stepId:""`; gap-free `seq` 0..n across a 10-event script; ISO `ts`; submission payload carries `failStreak` and (after a prior `editor_change`) `editLength/editHash/editDistanceProxy`; **no raw editor text anywhere** under default policy.
- [ ] **6.2** Implement `createRecorder({ learnerId, sessionId, clock, ids, policy, emitRow })` returning `(e: UiEvent) => void` plus an `emitInternal(type, stepId, payload)` hook for the IdleDetector. Tracks per-step state (kind from `step_enter`, last editor snapshot, fail streak via `derive.ts`).
- [ ] **6.3** Tests pass. Commit: `feat(telemetry): Recorder — UiEvent→BehavioralEvent mapping with sessionId/gap-free seq (§11.2)`.

### Task 7: IdleDetector

**Files:** Create `src/idle.ts`, `test/idle.test.ts`.

- [ ] **7.1** Failing tests (FakeClock; defining gate (b)): no activity for `idleThresholdMs` → exactly one `idle` row with `{durationMs: 90_000}`; any `reset()` before the threshold re-arms (tick 89_999 → reset → tick 89_999 → nothing; tick 1 more → idle); resumed activity after idle emits `dwell` with the full gap; `dispose()` clears the timer (no fire after).
- [ ] **7.2** Implement `createIdleDetector({ clock, thresholdMs, onSignal })` with `reset(stepId)` / `dispose()`.
- [ ] **7.3** Tests pass. Commit: `feat(telemetry): IdleDetector — injected-clock idle/dwell (§11.1)`.

### Task 8: EventBuffer (D7)

**Files:** Create `src/buffer.ts`, `test/buffer.test.ts`.

- [ ] **8.1** Failing tests (FakeClock, FakeListenerTarget, fake async sink): flush at size 20; interval flush at 5_000ms only when non-empty; `pagehide` and hidden-`visibilitychange` force a flush; a rejecting sink re-queues the batch at the front (next flush delivers all rows once, in seq order — no loss/dup/reorder); `dispose()` removes listeners (listenerCount→0) and clears the timer; **no sink call per single row** below thresholds.
- [ ] **8.2** Implement `createEventBuffer({ clock, target, isHidden, sink, maxBatch = 20, flushIntervalMs = 5_000 })` with `push(row)`, `flush()`, `dispose()`.
- [ ] **8.3** Tests pass. Commit: `feat(telemetry): EventBuffer — batched flushes incl. pagehide, loss-free (§11.1)`.

### Task 9: `attachTelemetry` — the §11.1 `TelemetryRecorder.attach`

**Files:** Create `src/attach.ts`, `test/attach.test.ts`. Modify `src/index.ts` (export everything public).

- [ ] **9.1** Failing integration tests using **`memoryDriver` from `@trellis/persist` as a devDependency of the TEST only** (add `"@trellis/persist": "workspace:*"` to telemetry's `devDependencies` — runtime deps stay schema-only): defining gates (a) and (e):
  - (a) scripted UiEvent sequence (session_start, step_enter, editor_change ×3, submission wrong ×2, hint_request, submission correct + predict fold, step_release) → **exact expected rows** in the `behavioral_event` store after a simulated `pagehide`, gap-free seq, batch count < event count;
  - idle: tick FakeClock 90s mid-script → an `idle` row appears;
  - (e) `enabled:false` → zero rows AND zero bus subscribers (assert via a probe subscriber count or by emitting and checking the store); planted source text in editor snapshots never appears in any persisted row (`JSON.stringify(allRows)` does not contain it);
  - detach: returned function unsubscribes, disposes idle+buffer, and a final flush drains pending rows.
- [ ] **9.2** Implement `attachTelemetry({ bus, persist, clock, ids, policy, learnerId, target, isHidden }): () => void` wiring bus → recorder → idle-reset → buffer → `persist.appendEvents`.
- [ ] **9.3** Tests pass; run the full telemetry suite. Commit: `feat(telemetry): attach() — bus→recorder→buffer→persist wiring; master switch never subscribes (§11.4)`.

### Task 10: ProactiveScaffolder (D5, headless)

**Files:** Create `src/scaffolder.ts`, `test/scaffolder.test.ts`.

- [ ] **10.1** Define the action/config surface:

```ts
export type ScaffoldAction =
  | { rule: "wrong_predict_then_correct_run"; stepId: string; action: "offer_hint"; level: 1 }
  | { rule: "three_fail_streak";              stepId: string; action: "advance_hint_one_level" }
  | { rule: "rapid_resubmit";                 stepId: string; action: "suggest_hint" }
  | { rule: "idle";                           stepId: string; action: "nudge_peek_or_hint" };

export interface ScaffoldConfig {
  rapidResubmitWindowMs: number;  // default 20_000
  rapidResubmitMaxDistance: number; // default 5
  failStreak: number;             // default 3
  idleThresholdMs: number;        // default 90_000
}
```

- [ ] **10.2** Failing tests for the **pure predicates** (each takes newest-first `BehavioralEvent[]` + config; defining gate (c) with near-miss mutations): three_fail_streak fires on exactly 3 trailing wrong submissions, NOT on 2, NOT on wrong-correct-wrong-wrong; rapid_resubmit fires on 2 submissions 19s apart with proxy 0, NOT 21s apart, NOT proxy 5, NOT when proxy absent (E2 note); wrong_predict_then_correct_run fires on wrong predict → correct next run/submission, NOT correct predict, NOT wrong→wrong; idle predicate is timer-driven (tested via the detector path); **priority**: a sequence satisfying both wrong_predict and three_fail_streak proposes only wrong_predict; **dedupe**: same state evaluated twice → one proposal.
- [ ] **10.3** Implement predicates + `createProactiveScaffolder({ bus, persist, clock, config, onAction }): () => void` (subscribes; evaluates on `submission`; own IdleDetector for `idle`; detach disposes).
- [ ] **10.4** Tests pass. Commit: `feat(telemetry): ProactiveScaffolder — four §11.3 rules as prioritized pure predicates, headless action seam`.

### Task 11: Client attach (one line + adapter)

**Files:** Modify `packages/client/src/app/TrellisApp.tsx`; create `packages/client/test/telemetryAttach.test.tsx`.

- [ ] **11.1** Failing client test: render TrellisApp with memoryDriver + stub fetch; complete one submission; assert `behavioral_event` rows exist in the driver's store; assert no behavior change in the existing walkthrough tests.
- [ ] **11.2** In the `ready` effect of TrellisApp (after `openTrellisDb`), attach:

```ts
const detach = attachTelemetry({
  bus,
  persist: { appendEvents: (ev) => appendEvents(db, ev), recentEvents: (q) => recentEvents(db, q) },
  clock: realClock, ids: realIds, policy: DEFAULT_CAPTURE_POLICY,
  learnerId: db.learnerId,
  target: document, isHidden: () => document.visibilityState === "hidden",
});
```

with `detach()` added to the effect cleanup (before `db.close()` — flush precedes close; mind the M5 teardown-race lesson: a flush against a closing db must warn-and-drop, never unhandled-reject).
- [ ] **11.3** Client suite green. Commit: `feat(client): attach telemetry recorder in the app shell (one-line seam, §11.1)`.

### Task 12 (gated on orchestrator approval of the D5 carve-out): three_fail_streak wiring

**Files:** Modify `packages/client/src/app/TrellisApp.tsx` or `CellRunner.tsx` (scaffolder attach + route `advance_hint_one_level` to the existing `pullHint()`); test in `packages/client/test/`.

- [ ] **12.1** Failing test: three wrong submissions → the hint ladder shows one more revealed level than the learner pulled, via existing HintLadder visuals; a fourth wrong submission does NOT advance again past the dedupe.
- [ ] **12.2** Wire `createProactiveScaffolder` with `onAction` routing only `advance_hint_one_level`; all other actions are recorded but surface nothing (await E5 design ⚑).
- [ ] **12.3** Commit: `feat(client): three_fail_streak auto-advances the hint ladder by one level (existing visuals only)`.

### Task 13: Real-browser walkthrough evidence (defining gate 5)

**Files:** Create under `verification/` only (follow the existing pattern there: TRELLIS_PORT, repo-root static server). Evidence → `verification/evidence/m6-telemetry-*`.

- [ ] **13.1** Extend/clone the marquee walkthrough spec: run it with telemetry attached; assert zero new pageerrors and the walkthrough stays green; then read real IndexedDB (`behavioral_event`) in-page and assert rows exist with gap-free per-session seq; reload; assert rows survived.
- [ ] **13.2** Save evidence (run log + row dump) under `verification/evidence/m6-telemetry-<date>/`. Commit: `test(verification): m6 telemetry real-browser walkthrough + IndexedDB evidence`.

### Task 14: Full defining gates (ALL FOREGROUND)

- [ ] **14.1** `export PATH="/opt/homebrew/lib/node_modules/corepack/shims:$PATH"`; turbo chain + `pnpm -r --workspace-concurrency=1 test` — baseline **534 stays green**; record new per-package totals.
- [ ] **14.2** Probes incl. `node -e "import('./packages/telemetry/dist/src/index.js')"` (after `pnpm --filter @trellis/telemetry build`).
- [ ] **14.3** Content gates unchanged (validate.py / harness.py / authoring CLI lint).
- [ ] **14.4** `pnpm install --frozen-lockfile` consistency proof.
- [ ] **14.5** Rebase on `main`; re-run the workspace suite; report. **Never merge/push to main.**

---

## 4. Risks / open questions for the orchestrator

1. **E1–E3 emit sites**: telemetry is correct without them (records what arrives) but `rapid_resubmit` and trustworthy `idle` are degraded until E2 lands. Recommend landing E2 first.
2. **D5 carve-out** (Task 12) needs an explicit orchestrator yes/no; Tasks 1–11 and 13–14 don't depend on it.
3. **E4**: confirm the predict-fold mapping vs. adding a `SignalType` literal.
4. **E6 TTL sweep**: deferred; confirm acceptable.
5. `session_start` sentinel `stepId: ""` (D3): schema-valid (StepId is a plain string), but flagging the convention for the record.
