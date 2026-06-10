import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";
import type { Bundle, BuildStep } from "@trellis/schema";
import { evaluate, canonicalDiagnosis } from "@trellis/engine";
import {
  createLocalSandbox,
  wrapGraphicalSandbox,
  toHeadlessStep,
  composeSubmission,
} from "@trellis/sandbox";

// M6.5 §17.8 — THE PROVING STEP (a test fixture, NOT a content/ corpus addition):
// one pygame build step graded HEADLESSLY through the frozen Run→Test→AST→Property
// ladder on the offline CPython twin. The real-browser mirror is verification/
// m65-pygame.js (Task 14). Requires local pygame (pip install pygame-ce) — skipped,
// not failed, where absent; CI proves less there but the defining gate is the browser.
const noPygame = spawnSync("python3", ["-c", "import pygame"], { encoding: "utf8" }).status !== 0;

// ---- the fixture ---------------------------------------------------------------

const DT = 1 / 60;
const FRAMES = 120;
const SEED = 7;

// §17.6/D2 — the LOCKED headless-aware preamble (decision of record:
// docs/design-notes/2026-06-10-pygame-headless-preamble.md). Under TRELLIS_HEADLESS=1
// (set by the grading wrapper's one-line prefix) there is no js import and no loop.
const PREAMBLE = [
  "import asyncio, os, pygame",
  '__HEADLESS = os.environ.get("TRELLIS_HEADLESS") == "1"',
  "if not __HEADLESS:",
  "    from js import window",
  '    os.environ["SDL_EMSCRIPTEN_KEYBOARD_ELEMENT"] = "#canvas"',
  "pygame.init()",
  "# Pyodide's Emscripten SDL ships no dummy VIDEO driver (real-browser finding,",
  "# Task 14) — headless grading renders to an offscreen Surface instead.",
  "screen = pygame.Surface((320, 240)) if __HEADLESS else pygame.display.set_mode((320, 240))",
  "GEN = 0 if __HEADLESS else int(window.gameGen)",
  "",
].join("\n");

const LOOP = [
  "",
  "async def main():",
  "    state = init(60.0)",
  "    while __HEADLESS is False and int(window.gameGen) == GEN:",
  "        state = update(state, [], 1 / 60)",
  "        pygame.display.flip()",
  "        await asyncio.sleep(1 / 60)",
  "",
  "if not __HEADLESS:",
  "    asyncio.ensure_future(main())",
  "",
].join("\n");

const CORRECT_REGION = [
  "def init(vy0):",
  '    return {"y": 100.0, "vy": vy0}',
  "",
  "def update(state, events, dt):",
  '    y = state["y"] + state["vy"] * dt',
  '    vy = state["vy"]',
  "    if y < 0:",
  "        y = 0.0",
  "        vy = -vy",
  "    if y > 200:",
  "        y = 200.0",
  "        vy = -vy",
  '    return {"y": y, "vy": vy}',
  "",
  "def probe(state):",
  '    return {"y": state["y"], "vy": state["vy"]}',
].join("\n");

// The wrong update: no bounce clamp (the planted misconception).
const WRONG_REGION = [
  "def init(vy0):",
  '    return {"y": 100.0, "vy": vy0}',
  "",
  "def update(state, events, dt):",
  '    return {"y": state["y"] + state["vy"] * dt, "vy": state["vy"]}',
  "",
  "def probe(state):",
  '    return {"y": state["y"], "vy": state["vy"]}',
].join("\n");

const CORRECT = PREAMBLE + CORRECT_REGION + LOOP;
const WRONG = PREAMBLE + WRONG_REGION + LOOP;

// The authored reference is PURE python (no pygame preamble): toHeadlessStep composes
// it with the same appendix + `sol` alias for the unchanged propertyRunner.
const REFERENCE = CORRECT_REGION;

// JS twin of the reference dynamics: IEEE-754 ops in the same order give the same
// doubles Python computes, so expected test outputs are bit-honest.
function simulate(frames: number, vy0: number): { y: number; vy: number } {
  let y = 100.0;
  let vy = vy0;
  for (let i = 0; i < frames; i++) {
    y = y + vy * DT;
    if (y < 0) {
      y = 0.0;
      vy = -vy;
    }
    if (y > 200) {
      y = 200.0;
      vy = -vy;
    }
  }
  return { y, vy };
}

const graphical = {
  entrypoints: { init: "init", update: "update", probe: "probe" },
  // a couple of key frames for D4 realism — the ball ignores events, the synthesis
  // path still executes (pygame import + Event construction in the worker).
  inputTape: [{}, { keysDown: ["K_LEFT"] }, { keysDown: ["K_LEFT"] }, {}],
  dt: DT,
  frames: FRAMES,
};

function fixtureStep(): BuildStep {
  return {
    id: "step.m65.bounce",
    kind: "build",
    prompt: "Make the ball bounce off the floor and ceiling.",
    skills: ["skill.m65.motion"],
    language: "python",
    runtime: "pygame",
    starterCode: CORRECT,
    lockedRegions: [{ startLine: 1, endLine: 8 }],
    evaluator: {
      run: { timeoutMs: 20000, memoryMb: 512, entrypoint: "update" },
      tests: {
        cases: [
          { input: [0, 240.0], expected: { y: 100.0, vy: 240.0 } },
          // frame 30 with vy0=240 is well past the y=200 bounce → clampless code fails
          { input: [30, 240.0], expected: simulate(30, 240.0) },
        ],
      },
      ast: {
        queries: [
          // fires when NOTHING in the learner source compares against the ceiling
          // constant 200 — the no-clamp submission has no such comparison; the locked
          // preamble/loop scaffold (which legitimately contains `if`s) has none either.
          {
            tag: "no_bounce_clamp",
            query: {
              not: {
                node: "Compare",
                where: { childMatches: { node: "Constant", where: { attr: "value", eq: 200 } } },
              },
            },
          },
          // would match the HARNESS appendix (its frame loop) but never the learner
          // region of the wrong submission — proves AST-over-learner-source (D3)
          { tag: "harness_would_match", query: { node: "For" } },
        ],
      },
      property: {
        referenceImpl: REFERENCE,
        generators: [
          { param: "frame", type: "int", min: 0, max: FRAMES - 1 },
          { param: "vy0", type: "float", min: -80, max: 80 },
        ],
        numCases: 12,
        seed: SEED,
      },
      graphical,
    },
  } as BuildStep;
}

function fixtureBundle(): Bundle {
  return {
    contentVersion: "m65-fixture@1",
    skills: {
      "skill.m65.motion": {
        id: "skill.m65.motion",
        title: "Frame-rate independent motion",
        description: "",
        misconceptions: ["mis.m65.no_bounce_clamp"],
        upstream: [],
      },
    },
    misconceptions: {
      "mis.m65.no_bounce_clamp": {
        id: "mis.m65.no_bounce_clamp",
        skill: "skill.m65.motion",
        title: "The ball flies through the walls",
        signature: { all: [{ astTag: "no_bounce_clamp" }, { testFailure: {} }] },
        hintLadder: [{ level: 1, body: "What should happen when y passes 200?" }],
        feedback: "Position keeps growing forever — clamp y at the edges and flip vy.",
      },
    },
    nodes: {},
    cells: {},
    producers: {},
    requirements: {},
  } as unknown as Bundle;
}

// ---- the e2e -------------------------------------------------------------------

const fx = { id: "diag-m65", learnerId: "L", now: "2026-06-10T00:00:00.000Z" };

describe.skipIf(noPygame)("M6.5 proving step — headless pygame grading e2e (twin)", () => {
  const sandbox = wrapGraphicalSandbox(createLocalSandbox());
  const step = fixtureStep();
  const headless = toHeadlessStep(step);
  const bundle = fixtureBundle();

  it(
    "correct update → pass; two full evaluates are byte-identical modulo wallMs",
    async () => {
      const sub = { kind: "build" as const, code: composeSubmission(step, CORRECT) };
      const a = await evaluate(headless, sub, sandbox, bundle, fx);
      const b = await evaluate(headless, sub, sandbox, bundle, fx);
      expect(a.correct).toBe(true);
      expect(a.attribution).toBe("pass");
      expect(a.signals.tests).toEqual({ passed: 2, failed: 0, failures: [] });
      expect(a.signals.property?.passed).toBe(true);
      expect(JSON.stringify(canonicalDiagnosis(a))).toBe(JSON.stringify(canonicalDiagnosis(b)));
    },
    180_000,
  );

  it(
    "wrong update (no bounce clamp) → misconception-attributed via the normal ladder; AST tags over learner source only",
    async () => {
      const sub = { kind: "build" as const, code: composeSubmission(step, WRONG) };
      const d = await evaluate(headless, sub, sandbox, bundle, fx);
      expect(d.correct).toBe(false);
      expect(d.attribution).toBe("misconception");
      expect(d.misconceptionId).toBe("mis.m65.no_bounce_clamp");
      expect(d.signals.tests?.failed).toBe(1); // frame-30 case
      // D3: the harness appendix contains a For loop; the learner's wrong region does
      // not — the tag must NOT fire (queries ran over learner source only).
      expect(d.signals.astTags).toContain("no_bounce_clamp");
      expect(d.signals.astTags).not.toContain("harness_would_match");
    },
    180_000,
  );

  it(
    "the property rung catches a tests-passing drift (reference trajectory comparison)",
    async () => {
      // passes BOTH authored test cases (they drive |vy| = 240, untouched by the bug)
      // but drifts for every slow ball — the generators sample vy0 in [-80, 80], so
      // any sampled frame ≥ 1 diverges from the reference. Only the property rung's
      // sampled (frame, vy0) trajectory comparison can catch it.
      const DRIFTY_REGION = [
        "def init(vy0):",
        '    return {"y": 100.0, "vy": vy0}',
        "",
        "def update(state, events, dt):",
        '    y = state["y"] + state["vy"] * dt',
        '    if abs(state["vy"]) < 100:',
        "        y = y + 0.001  # speed-dependent drift: invisible at the tested vy0=240",
        '    vy = state["vy"]',
        "    if y < 0:",
        "        y = 0.0",
        "        vy = -vy",
        "    if y > 200:",
        "        y = 200.0",
        "        vy = -vy",
        '    return {"y": y, "vy": vy}',
        "",
        "def probe(state):",
        '    return {"y": state["y"], "vy": state["vy"]}',
      ].join("\n");
      const DRIFTY = PREAMBLE + DRIFTY_REGION + LOOP;
      const sub = { kind: "build" as const, code: composeSubmission(step, DRIFTY) };
      const d = await evaluate(headless, sub, sandbox, bundle, fx);
      expect(d.correct).toBe(false);
      expect(d.signals.tests?.failed).toBe(0);
      expect(d.signals.property?.passed).toBe(false);
      expect(d.signals.property?.counterexample).toBeDefined();
    },
    180_000,
  );
});
