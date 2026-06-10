import { describe, it, expect } from "vitest";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { loadContent, compile } from "@trellis/authoring";
import { createLocalSandbox } from "@trellis/sandbox";
import {
  evaluate,
  ladderKeyFor,
  ladderFor,
  syncLadder,
  pullHint,
  visibleHints,
  initialHintState,
  canonicalDiagnosis,
} from "@trellis/engine";
import type { BuildStep, Bundle, Step } from "@trellis/schema";

const HERE = dirname(fileURLToPath(import.meta.url)); // packages/integration-tests/test
const CONTENT_ROOT = resolve(HERE, "../../../content");
const bundle: Bundle = compile(loadContent(CONTENT_ROOT));
const sandbox = createLocalSandbox();
const fx = { id: "d1", learnerId: "L1", now: "2026-06-08T00:00:00.000Z" };

function findStep(stepId: string): Step {
  for (const cid of Object.keys(bundle.cells)) {
    const cell = bundle.cells[cid]!;
    for (const st of cell.steps) if (st.id === stepId) return st;
  }
  throw new Error(`step ${stepId} not found in compiled bundle`);
}

const STR_NUM_STEP = findStep("cell.string_concat.text_plus_number#4") as BuildStep;
// START-HERE's `'age: ' + age` shorthand for the str+number fault on this entrypoint:
const BAD = 'def announce(number):\n    return "Your random number is: " + number';
const GOOD = 'def announce(number):\n    return "Your random number is: " + str(number)';

describe("M4 marquee — str+number → mis.concat.str_num → feedback → pullable ladder", () => {
  it("the str+number fault is attributed to mis.concat.str_num with the authored feedback", { timeout: 60_000 }, async () => {
    const d = await evaluate(STR_NUM_STEP, { kind: "build", code: BAD }, sandbox, bundle, fx);
    expect(d.correct).toBe(false);
    expect(d.attribution).toBe("misconception");
    expect(d.misconceptionId).toBe("mis.concat.str_num");

    const authored = bundle.misconceptions["mis.concat.str_num"]!;
    expect(authored.feedback).toContain("TypeError");
    expect(authored.feedback.length).toBeGreaterThan(0);
  });

  it("a correct str() solution passes — no misconception, no ladder", { timeout: 60_000 }, async () => {
    const d = await evaluate(STR_NUM_STEP, { kind: "build", code: GOOD }, sandbox, bundle, fx);
    expect(d.correct).toBe(true);
    expect(d.attribution).toBe("pass");
    expect(ladderKeyFor(d)).toBe("");
  });

  it("each press reveals exactly one more level; level 4 (revealCode) is behind a confirm", { timeout: 60_000 }, async () => {
    const d = await evaluate(STR_NUM_STEP, { kind: "build", code: BAD }, sandbox, bundle, fx);
    const ladder = ladderFor(ladderKeyFor(d), bundle);
    expect(ladder.map((h) => h.level)).toEqual([1, 2, 3, 4]);
    expect(ladder[3]!.revealCode).toBeTruthy();

    let s = syncLadder(initialHintState(), d);
    expect(s).toEqual({ ladderKey: "mis.concat.str_num", revealedThrough: 0 });
    expect(visibleHints(s, ladder)).toEqual([]);

    s = pullHint(s, ladder);
    expect(visibleHints(s, ladder).map((h) => h.level)).toEqual([1]);
    s = pullHint(s, ladder);
    expect(visibleHints(s, ladder).map((h) => h.level)).toEqual([1, 2]);
    s = pullHint(s, ladder);
    expect(visibleHints(s, ladder).map((h) => h.level)).toEqual([1, 2, 3]);

    const stuck = pullHint(s, ladder);
    expect(stuck.revealedThrough).toBe(3);
    expect(visibleHints(stuck, ladder).some((h) => h.revealCode !== undefined)).toBe(false);

    s = pullHint(s, ladder, { confirmRevealCode: true });
    expect(s.revealedThrough).toBe(4);
    expect(visibleHints(s, ladder).some((h) => h.revealCode !== undefined)).toBe(true);
  });

  it("autoEscalate on a repeat of the same misconception raises the floor (no re-reading level 1)", { timeout: 60_000 }, async () => {
    const d = await evaluate(STR_NUM_STEP, { kind: "build", code: BAD }, sandbox, bundle, fx);
    const ladder = ladderFor(ladderKeyFor(d), bundle);
    let s = pullHint(syncLadder(initialHintState(), d), ladder); // revealedThrough 1
    s = syncLadder(s, d, { autoEscalate: true });
    expect(s.revealedThrough).toBe(2);
    expect(visibleHints(s, ladder).map((h) => h.level)).toEqual([1, 2]);
  });

  it("a different misconception resets the ladder to level 0", { timeout: 60_000 }, async () => {
    const d = await evaluate(STR_NUM_STEP, { kind: "build", code: BAD }, sandbox, bundle, fx);
    const ladder = ladderFor(ladderKeyFor(d), bundle);
    let s = pullHint(pullHint(syncLadder(initialHintState(), d), ladder), ladder);
    expect(s.revealedThrough).toBe(2);
    const synt = await evaluate(STR_NUM_STEP, { kind: "build", code: "def announce(number)\n    return number" }, sandbox, bundle, fx);
    s = syncLadder(s, synt);
    expect(s.ladderKey).not.toBe("mis.concat.str_num");
    expect(s.revealedThrough).toBe(0);
  });

  it("determinism: the same submission yields a byte-identical Diagnosis (modulo wallMs)", { timeout: 60_000 }, async () => {
    // Canonical comparison per the 2026-06-09 wallMs decision: signals.wallMs is excluded
    // (a real-time sandbox stamps real wall-clock; the local twin happens to pin 0).
    const a = await evaluate(STR_NUM_STEP, { kind: "build", code: BAD }, sandbox, bundle, fx);
    const b = await evaluate(STR_NUM_STEP, { kind: "build", code: BAD }, sandbox, bundle, fx);
    expect(JSON.stringify(canonicalDiagnosis(a))).toBe(JSON.stringify(canonicalDiagnosis(b)));
  });
});
