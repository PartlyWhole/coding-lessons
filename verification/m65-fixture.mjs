// M6.5 defining-gate fixture (Task 14). The SAME bouncing-ball proving step as the
// twin e2e (packages/integration-tests/test/m65-pygame-e2e.test.ts), with the §17.3
// play loop instrumented for the harness: window.__trellisFrameTick increments per
// frame (loop-liveness/stacking assertions) and window.__trellisKeySeen counts
// KEYDOWN events the GAME received (keyboard-scoping assertion). The page presets
// both counters to 0 before mount.
//
// NOTE (harness convenience): lockedRegions are intentionally OMITTED so the driver
// can select-all + retype whole programs; the lockedRegions editor behavior is
// covered by the client unit suite and is content policy, not runtime mechanics.

export const DT = 1 / 60;
export const FRAMES = 120;
export const SEED = 7;

// §17.6/D2 — the headless-aware locked preamble (decision of record:
// docs/design-notes/2026-06-10-pygame-headless-preamble.md).
export const PREAMBLE = [
  "import asyncio, os, pygame",
  '__HEADLESS = os.environ.get("TRELLIS_HEADLESS") == "1"',
  "if not __HEADLESS:",
  "    from js import window",
  '    os.environ["SDL_EMSCRIPTEN_KEYBOARD_ELEMENT"] = "#canvas"',
  "pygame.init()",
  "# Pyodide's Emscripten SDL ships no dummy VIDEO driver — headless grading renders",
  "# to an offscreen Surface; only the main-thread player owns a real display.",
  "screen = pygame.Surface((320, 240)) if __HEADLESS else pygame.display.set_mode((320, 240))",
  "GEN = 0 if __HEADLESS else int(window.gameGen)",
  "",
].join("\n");

export const CORRECT_REGION = [
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

// The wrong update: no bounce clamp (the planted misconception — no compare vs 200).
export const WRONG_REGION = [
  "def init(vy0):",
  '    return {"y": 100.0, "vy": vy0}',
  "",
  "def update(state, events, dt):",
  '    return {"y": state["y"] + state["vy"] * dt, "vy": state["vy"]}',
  "",
  "def probe(state):",
  '    return {"y": state["y"], "vy": state["vy"]}',
].join("\n");

export const LOOP = [
  "",
  "def draw(screen, state):",
  "    screen.fill((16, 28, 36))",
  '    pygame.draw.circle(screen, (242, 201, 76), (160, int(220 - state["y"])), 12)',
  "",
  "async def main():",
  "    state = init(120.0)",
  "    while __HEADLESS is False and int(window.gameGen) == GEN:",
  "        events = pygame.event.get()",
  "        for e in events:",
  "            if e.type == pygame.KEYDOWN:",
  "                window.__trellisKeySeen = window.__trellisKeySeen + 1",
  "        state = update(state, events, 1 / 60)",
  "        draw(screen, state)",
  "        pygame.display.flip()",
  "        window.__trellisFrameTick = window.__trellisFrameTick + 1",
  "        await asyncio.sleep(1 / 60)",
  "",
  "if not __HEADLESS:",
  "    asyncio.ensure_future(main())",
  "",
].join("\n");

export const CORRECT = PREAMBLE + CORRECT_REGION + LOOP;
export const WRONG = PREAMBLE + WRONG_REGION + LOOP;
export const AWAITLESS = "while True:\n    x = 1\n";

// JS twin of the reference dynamics (IEEE-754 ops in the same order as Python).
export function simulate(frames, vy0) {
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

export const CONTENT_VERSION = "m65-fixture@1";
export const CELL_ID = "cell.m65.bounce";

export function fixtureBundle() {
  const step = {
    id: "step.m65.bounce",
    kind: "build",
    prompt: "Make the ball bounce off the floor and ceiling.",
    skills: ["skill.m65.motion"],
    language: "python",
    runtime: "pygame",
    starterCode: CORRECT,
    evaluator: {
      // pool-default cap (256) so graded runs stay POOLED; if pygame-ce blows the cap
      // in the real browser this is the A6 knob to raise (report it).
      run: { timeoutMs: 60000, memoryMb: 256, entrypoint: "update" },
      tests: {
        cases: [
          { input: [0, 240.0], expected: { y: 100.0, vy: 240.0 } },
          { input: [30, 240.0], expected: simulate(30, 240.0) },
        ],
      },
      ast: {
        queries: [
          {
            tag: "no_bounce_clamp",
            query: {
              not: {
                node: "Compare",
                where: { childMatches: { node: "Constant", where: { attr: "value", eq: 200 } } },
              },
            },
          },
        ],
      },
      property: {
        referenceImpl: CORRECT_REGION,
        generators: [
          { param: "frame", type: "int", min: 0, max: FRAMES - 1 },
          { param: "vy0", type: "float", min: -80, max: 80 },
        ],
        numCases: 12,
        seed: SEED,
      },
      graphical: {
        entrypoints: { init: "init", update: "update", probe: "probe" },
        inputTape: [{}, { keysDown: ["K_LEFT"] }, { keysDown: ["K_LEFT"] }, {}],
        dt: DT,
        frames: FRAMES,
      },
    },
  };

  return {
    contentVersion: CONTENT_VERSION,
    skills: {
      "skill.m65.motion": {
        id: "skill.m65.motion",
        title: "Frame-rate independent motion",
        description: "Position integrates velocity over dt; edges clamp and reflect.",
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
    nodes: {
      "node.m65.pygame": {
        id: "node.m65.pygame",
        title: "Moving pictures",
        track: "spine",
        requires: [],
        teaches: ["skill.m65.motion"],
        cells: [CELL_ID],
      },
    },
    cells: {
      [CELL_ID]: {
        id: CELL_ID,
        nodeId: "node.m65.pygame",
        title: "The bouncing ball",
        steps: [step],
        certifies: ["skill.m65.motion"],
      },
    },
    producers: { "skill.m65.motion": ["node.m65.pygame"] },
    requirements: { "node.m65.pygame": [] },
  };
}
