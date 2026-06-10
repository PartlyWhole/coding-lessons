import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";
import { createLocalSandbox } from "../../src/index.js";
import {
  composeHeadlessSource,
  composeReferenceSource,
  APPENDIX_MARKER,
  HEADLESS_PREFIX,
} from "../../src/graphical/compose.js";
import type { GraphicalConfig } from "../../src/graphical/types.js";

const noPygame = spawnSync("python3", ["-c", "import pygame"], { encoding: "utf8" }).status !== 0;

const g: GraphicalConfig = {
  entrypoints: { init: "init", update: "update", probe: "probe" },
  inputTape: [{}, { keysDown: ["K_LEFT"] }, { keysDown: ["K_LEFT"] }, {}],
  dt: 1 / 60,
  frames: 120,
};

const LEARNER = [
  "def init():",
  '    return {"y": 100.0, "vy": 30.0}',
  "",
  "def update(state, events, dt):",
  '    return {"y": state["y"] + state["vy"] * dt, "vy": state["vy"]}',
  "",
  "def probe(state):",
  '    return {"y": state["y"], "vy": state["vy"]}',
].join("\n");

describe("composeHeadlessSource — string level (D1)", () => {
  it("contains the marker exactly once, with the learner source VERBATIM above it (line numbers preserved)", () => {
    const out = composeHeadlessSource(g, LEARNER, 7);
    const idx = out.indexOf(APPENDIX_MARKER);
    expect(idx).toBeGreaterThan(-1);
    expect(out.indexOf(APPENDIX_MARKER, idx + 1)).toBe(-1);
    expect(out.startsWith(LEARNER)).toBe(true);
  });
  it("defines __trellis_sim and bakes dt, frames, the tape and the seed", () => {
    const out = composeHeadlessSource(g, LEARNER, 7);
    expect(out).toContain("def __trellis_sim(");
    expect(out).toContain(String(g.dt));
    expect(out).toContain("120");
    expect(out).toContain("= 7"); // baked seed
  });
  it("HEADLESS_PREFIX is exactly one line setting dummy drivers + TRELLIS_HEADLESS", () => {
    expect(HEADLESS_PREFIX.endsWith("\n")).toBe(true);
    expect(HEADLESS_PREFIX.trimEnd().split("\n").length).toBe(1);
    expect(HEADLESS_PREFIX).toContain('SDL_VIDEODRIVER"]="dummy"');
    expect(HEADLESS_PREFIX).toContain('SDL_AUDIODRIVER"]="dummy"');
    expect(HEADLESS_PREFIX).toContain('TRELLIS_HEADLESS"]="1"');
  });
  it("composeReferenceSource aliases sol = __trellis_sim (the propertyRunner oracle contract)", () => {
    const ref = composeReferenceSource(g, LEARNER, 7);
    expect(ref).toContain("sol = __trellis_sim");
    expect(ref).toContain(APPENDIX_MARKER);
  });
});

// Behavioral tier on the offline CPython twin. The driver wraps __trellis_sim in a
// zero-arg entrypoint (RUN_HARNESS calls entrypoints with no args; the engine's
// testRunner appends its own arg-passing driver in production).
const sb = createLocalSandbox();
async function simValue(source: string, expr: string): Promise<unknown> {
  const code = `${source}\ndef __t():\n    return ${expr}\n`;
  const r = await sb.run({ code, entrypoint: "__t", timeoutMs: 20000, memoryMb: 512 });
  if (!r.ran) throw new Error(`twin run failed: ${JSON.stringify(r.error)} ${r.stdout}`);
  return r.returnValue;
}

describe("composeHeadlessSource — behavioral (CPython twin, pure-python triple)", () => {
  // The empty/keys-free path must not require pygame at all (lazy import honesty).
  const pureTape: GraphicalConfig = { ...g, inputTape: [{}, {}, {}, {}] };

  it("__trellis_sim(0) probes the INITIAL state (== probe(init()))", async () => {
    const out = composeHeadlessSource(pureTape, LEARNER, 0);
    expect(await simValue(out, "__trellis_sim(0)")).toEqual({ y: 100.0, vy: 30.0 });
  });

  it("__trellis_sim(3) equals 3 hand-applied updates", async () => {
    const out = composeHeadlessSource(pureTape, LEARNER, 0);
    const dt = 1 / 60;
    const y = 100.0 + 30.0 * dt + 30.0 * dt + 30.0 * dt;
    const got = (await simValue(out, "__trellis_sim(3)")) as { y: number; vy: number };
    expect(got.vy).toBe(30.0);
    expect(got.y).toBeCloseTo(y, 12);
  });
});

describe.skipIf(noPygame)("event synthesis from the tape (D4, needs local pygame)", () => {
  const RECORDER = [
    "def init():",
    "    return []",
    "",
    "def update(state, events, dt):",
    "    import pygame",
    "    for e in events:",
    '        kind = "DOWN" if e.type == pygame.KEYDOWN else ("UP" if e.type == pygame.KEYUP else "OTHER")',
    "        state = state + [[kind, e.key]]",
    "    return state",
    "",
    "def probe(state):",
    "    return state",
  ].join("\n");

  it("KEYDOWN exactly on the frame a key enters keysDown; KEYUP when it leaves", async () => {
    // tape: frame0 {}, frame1 K_LEFT, frame2 K_LEFT (held — no event), frame3 {} (KEYUP)
    const out = composeHeadlessSource(g, RECORDER, 0);
    const got = (await simValue(out, "__trellis_sim(4)")) as [string, number][];
    const kLeft = (await simValue("import pygame", "pygame.K_LEFT")) as number;
    expect(got).toEqual([
      ["DOWN", kLeft],
      ["UP", kLeft],
    ]);
  });

  it("a mouse frame emits one MOUSEMOTION with pos/buttons", async () => {
    const mg: GraphicalConfig = { ...g, inputTape: [{ mouse: { x: 10, y: 20, buttons: 1 } }] };
    const REC = [
      "def init():",
      "    return []",
      "def update(state, events, dt):",
      "    import pygame",
      "    return state + [[e.type == pygame.MOUSEMOTION, list(e.pos), e.buttons] for e in events]",
      "def probe(state):",
      "    return state",
    ].join("\n");
    const out = composeHeadlessSource(mg, REC, 0);
    expect(await simValue(out, "__trellis_sim(1)")).toEqual([[true, [10, 20], 1]]);
  });
});

describe("determinism (same seed, same tape → byte-identical)", () => {
  const RANDOMY = [
    "import random",
    "def init():",
    "    return 0.0",
    "def update(state, events, dt):",
    "    return state + random.random()",
    "def probe(state):",
    "    return state",
  ].join("\n");

  it("two runs of the same composed source agree exactly", async () => {
    const pureTape: GraphicalConfig = {
      entrypoints: { init: "init", update: "update", probe: "probe" },
      inputTape: [],
      dt: 1 / 60,
      frames: 10,
    };
    const out = composeHeadlessSource(pureTape, RANDOMY, 42);
    const a = await simValue(out, "__trellis_sim(5)");
    const b = await simValue(out, "__trellis_sim(5)");
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(typeof a).toBe("number");
    expect(a).not.toBe(0);
  });
});

describe("optional entrypoints", () => {
  it("no init → state starts as None; no probe → raw state returned", async () => {
    const noOpt: GraphicalConfig = {
      entrypoints: { update: "update" },
      inputTape: [],
      dt: 1 / 60,
      frames: 5,
    };
    const SRC = ["def update(state, events, dt):", "    return (state or 0) + 1"].join("\n");
    const out = composeHeadlessSource(noOpt, SRC, 0);
    expect(await simValue(out, "__trellis_sim(0)")).toBe(null);
    expect(await simValue(out, "__trellis_sim(2)")).toBe(2);
  });
});
