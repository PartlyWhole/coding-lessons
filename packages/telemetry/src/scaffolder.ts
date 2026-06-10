// §11.3 ProactiveScaffolder — deterministic rules engine, HEADLESS (D5): it proposes
// ScaffoldActions through onAction and renders nothing. No Greenhouse pattern exists for
// a proactive non-modal affordance (design ⚑ E5); the ONE sanctioned visual route is the
// client wiring three_fail_streak's advance_hint_one_level onto the existing HintLadder
// pull path (orchestrator-approved carve-out — existing visual language only).
//
// Frozen dosage rules: proposals are SUGGESTIONS ONLY; only three_fail_streak may
// auto-advance the ladder, by exactly one level; highest-priority firing rule wins
// (wrong_predict_then_correct_run > three_fail_streak > rapid_resubmit > idle); a given
// (rule, stepId) fires at most once until step_enter re-arms that step (never nagging —
// deliberately NOT re-armed by further submissions, so a 4th wrong cannot re-advance).
import type { BehavioralEvent } from "@trellis/schema";
import type { EventBus } from "./bus.js";
import type { Clock, TelemetryPersist } from "./ports.js";
import { wrongPredictThenCorrect } from "./derive.js";
import { createIdleDetector } from "./idle.js";

export type ScaffoldAction =
  | { rule: "wrong_predict_then_correct_run"; stepId: string; action: "offer_hint"; level: 1 }
  | { rule: "three_fail_streak"; stepId: string; action: "advance_hint_one_level" }
  | { rule: "rapid_resubmit"; stepId: string; action: "suggest_hint" }
  | { rule: "idle"; stepId: string; action: "nudge_peek_or_hint" };

export interface ScaffoldConfig {
  rapidResubmitWindowMs: number;
  rapidResubmitMaxDistance: number;
  failStreak: number;
  idleThresholdMs: number;
}

export const DEFAULT_SCAFFOLD_CONFIG: ScaffoldConfig = {
  rapidResubmitWindowMs: 20_000,
  rapidResubmitMaxDistance: 5,
  failStreak: 3,
  idleThresholdMs: 90_000,
};

function payloadOf(e: BehavioralEvent): Record<string, unknown> {
  return typeof e.payload === "object" && e.payload !== null && !Array.isArray(e.payload)
    ? (e.payload as Record<string, unknown>)
    : {};
}

// ---- Pure predicates (newest-first BehavioralEvent[]; same rows in, same verdict out) ----

/** Rule 1: a wrong predict whose very next outcome (run / correct submission) shows the truth. */
export function ruleWrongPredictThenCorrectRun(rowsNewestFirst: readonly BehavioralEvent[]): boolean {
  return wrongPredictThenCorrect(rowsNewestFirst);
}

/** Rule 2: ≥ config.failStreak consecutive trailing wrong submissions on THIS step. */
export function ruleThreeFailStreak(
  rowsNewestFirst: readonly BehavioralEvent[],
  stepId: string,
  config: ScaffoldConfig,
): boolean {
  let streak = 0;
  for (const e of rowsNewestFirst) {
    if (e.type !== "submission" || e.stepId !== stepId) continue;
    if (payloadOf(e)["correct"] === false) {
      streak++;
      if (streak >= config.failStreak) return true;
    } else {
      break; // a correct submission ends the trailing streak
    }
  }
  return false;
}

/** Rule 3: a wrong resubmit within the window with (proxy) edit distance below the floor.
    When no editDistanceProxy exists (no editor_change data), this CANNOT fire — never a guess. */
export function ruleRapidResubmit(
  rowsNewestFirst: readonly BehavioralEvent[],
  stepId: string,
  config: ScaffoldConfig,
): boolean {
  const subs = rowsNewestFirst.filter((e) => e.type === "submission" && e.stepId === stepId);
  const [latest, prior] = [subs[0], subs[1]];
  if (latest === undefined || prior === undefined) return false;
  const p = payloadOf(latest);
  if (p["correct"] !== false) return false; // rapid-resubmit scaffolds struggle, not success
  const proxy = p["editDistanceProxy"];
  if (typeof proxy !== "number" || proxy >= config.rapidResubmitMaxDistance) return false;
  const gapMs = Date.parse(latest.ts) - Date.parse(prior.ts);
  return gapMs >= 0 && gapMs < config.rapidResubmitWindowMs;
}

// ---- The engine ----

export interface ProactiveScaffolderDeps {
  bus: EventBus;
  persist: TelemetryPersist;
  clock: Clock;
  config?: ScaffoldConfig;
  onAction: (a: ScaffoldAction) => void;
}

export function createProactiveScaffolder(deps: ProactiveScaffolderDeps): () => void {
  const { bus, persist, clock, onAction } = deps;
  const config = deps.config ?? DEFAULT_SCAFFOLD_CONFIG;
  const fired = new Set<string>(); // `${rule}:${stepId}` — re-armed only by step_enter

  function propose(a: ScaffoldAction): void {
    const key = `${a.rule}:${a.stepId}`;
    if (fired.has(key)) return;
    fired.add(key);
    try {
      onAction(a);
    } catch {
      // a UI bug must never break telemetry (mirror of the bus's own swallow rule)
    }
  }

  // Submission-driven rules, in frozen priority order; first match wins.
  async function evaluate(stepId: string): Promise<void> {
    const rows = await persist.recentEvents({ limit: 50 });
    if (ruleWrongPredictThenCorrectRun(rows)) {
      return propose({ rule: "wrong_predict_then_correct_run", stepId, action: "offer_hint", level: 1 });
    }
    if (ruleThreeFailStreak(rows, stepId, config)) {
      return propose({ rule: "three_fail_streak", stepId, action: "advance_hint_one_level" });
    }
    if (ruleRapidResubmit(rows, stepId, config)) {
      return propose({ rule: "rapid_resubmit", stepId, action: "suggest_hint" });
    }
  }

  // Rule 4 (idle) is timer-driven via the scaffolder's OWN detector on the same clock.
  const idle = createIdleDetector({
    clock,
    thresholdMs: config.idleThresholdMs,
    onSignal: (s) => {
      if (s.kind === "idle") propose({ rule: "idle", stepId: s.stepId, action: "nudge_peek_or_hint" });
    },
  });

  const unsubscribe = bus.subscribe((e) => {
    if (e.t === "session_start") {
      idle.reset("");
      return;
    }
    idle.reset(e.stepId);
    if (e.t === "step_enter") {
      for (const rule of ["wrong_predict_then_correct_run", "three_fail_streak", "rapid_resubmit", "idle"]) {
        fired.delete(`${rule}:${e.stepId}`);
      }
      return;
    }
    if (e.t === "submission") {
      // Deferred one microtask so the telemetry Recorder's submission flush (subscribed
      // first in the client) starts its write before our read (D5 read-after-write).
      const stepId = e.stepId;
      void Promise.resolve().then(() =>
        evaluate(stepId).catch(() => {
          // a read failure (closing db) silently skips this evaluation — suggestions only
        }),
      );
    }
  });

  return function detach(): void {
    unsubscribe();
    idle.dispose();
  };
}
