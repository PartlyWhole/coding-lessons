// Gate 10 (E-17): graphical-step authoring lint — pygame content is being authored NOW.
// Clause-by-clause mutation style (mirrors gates 8/9 tests): each clause has a broken
// fixture (gate fires) and a restored twin (gate silent).
import { describe, it, expect } from "vitest";
import { resolve } from "node:path";
import { loadContent } from "../src/load.js";
import { gateGraphical } from "../src/gates/graphical.js";
import type { Loaded, RawStep } from "../src/raw-types.js";

const CONTENT = resolve(__dirname, "../../../content");

function loadedWith(steps: RawStep[]): Loaded {
  return {
    nodes: {
      n: {
        id: "n", title: "", track: "spine", requires: [], teaches: [],
        cells: [{ id: "c", title: "", steps }],
      },
    },
    skills: {},
    miscons: {},
  };
}

// The canonical §17.4 shape (m65-pygame-e2e fixture, simplified): locked preamble on
// line 1, pure update + probe entrypoints, short tape.
const STARTER =
  "import os  # TRELLIS locked preamble (headless-aware, design-note 2026-06-10)\n" +
  "def make_state():\n    return {\"y\": 100.0, \"vy\": 40.0}\n" +
  "def update(state, events, dt):\n    state[\"y\"] += state[\"vy\"] * dt\n    return state\n" +
  "def probe(state):\n    return {\"y\": state[\"y\"]}\n";

function pygameStep(overrides: Record<string, unknown> = {}, evOverrides: Record<string, unknown> = {}): RawStep {
  return {
    id: "cell.game.bounce#1",
    kind: "build",
    runtime: "pygame",
    starterCode: STARTER,
    lockedRegions: [{ startLine: 1, endLine: 1 }],
    evaluator: {
      run: { timeoutMs: 5000, memoryMb: 512 },
      graphical: {
        entrypoints: { init: "make_state", update: "update", probe: "probe" },
        inputTape: [{ keysDown: ["K_LEFT"] }],
        dt: 1 / 60,
        frames: 60,
      },
      ...evOverrides,
    },
    ...overrides,
  };
}

describe("gate 10: graphical-step lint (E-17)", () => {
  it("passes on the real corpus (no pygame steps on main yet)", () => {
    expect(gateGraphical(loadContent(CONTENT))).toEqual([]);
  });

  it("a well-formed pygame step is silent (all clauses restored)", () => {
    expect(gateGraphical(loadedWith([pygameStep()]))).toEqual([]);
  });

  // ---- clause (a): runtime "pygame" <-> evaluator.graphical pairing -------------------
  it("(a) FIRES: runtime pygame without evaluator.graphical", () => {
    const issues = gateGraphical(loadedWith([pygameStep({}, { graphical: undefined })]));
    expect(issues).toHaveLength(1);
    expect(issues[0]!.gate).toBe("10-graphical");
    expect(issues[0]!.level).toBe("error");
    expect(issues[0]!.message).toMatch(/graphical/);
  });

  it("(a) FIRES: graphical block on a non-pygame build step", () => {
    const issues = gateGraphical(loadedWith([pygameStep({ runtime: "headless" })]));
    expect(issues).toHaveLength(1);
    expect(issues[0]!.message).toMatch(/non-pygame|runtime/i);
  });

  it("(a) FIRES: graphical block on a step with no runtime at all", () => {
    const issues = gateGraphical(loadedWith([pygameStep({ runtime: undefined })]));
    expect(issues).toHaveLength(1);
  });

  it("(a) silent: a plain headless build step without graphical", () => {
    const step = pygameStep({ runtime: undefined }, { graphical: undefined });
    expect(gateGraphical(loadedWith([step]))).toEqual([]);
  });

  // ---- clause (b): entrypoints exist as `def <name>` in starterCode -------------------
  it("(b) FIRES: update entrypoint missing from starterCode", () => {
    const step = pygameStep({
      starterCode: "import os\ndef make_state():\n    return {}\ndef probe(s):\n    return {}\n",
    });
    const issues = gateGraphical(loadedWith([step]));
    expect(issues).toHaveLength(1);
    expect(issues[0]!.message).toContain("update");
    expect(issues[0]!.message).toMatch(/def/);
  });

  it("(b) FIRES: a declared probe entrypoint missing from starterCode", () => {
    const step = pygameStep({
      starterCode: "import os\ndef make_state():\n    return {}\ndef update(s, e, dt):\n    return s\n",
    });
    const issues = gateGraphical(loadedWith([step]));
    expect(issues).toHaveLength(1);
    expect(issues[0]!.message).toContain("probe");
  });

  it("(b) silent: optional init/probe simply absent from the graphical block", () => {
    const step = pygameStep({}, {
      graphical: {
        entrypoints: { update: "update" },
        inputTape: [],
        dt: 1 / 60,
        frames: 60,
      },
    });
    expect(gateGraphical(loadedWith([step]))).toEqual([]);
  });

  it("(b) FIRES: starterCode does not parse (entrypoints unverifiable)", () => {
    const step = pygameStep({ starterCode: "def update(:\n" });
    const issues = gateGraphical(loadedWith([step]));
    expect(issues.length).toBeGreaterThan(0);
    expect(issues.some((i) => /syntax/i.test(i.message))).toBe(true);
  });

  it("(b) an async def satisfies the entrypoint check (the §17 scaffold is async-shaped)", () => {
    const step = pygameStep({
      starterCode:
        "import os\nasync def update(state, events, dt):\n    return state\ndef make_state():\n    return {}\ndef probe(s):\n    return {}\n",
    });
    expect(gateGraphical(loadedWith([step]))).toEqual([]);
  });

  // ---- clause (c): frames ≤ 600 (warn) and inputTape.length ≤ frames (error) ----------
  it("(c) WARNS: frames above 600 (§17.7 budget)", () => {
    const step = pygameStep({}, {
      graphical: {
        entrypoints: { init: "make_state", update: "update", probe: "probe" },
        inputTape: [],
        dt: 1 / 60,
        frames: 601,
      },
    });
    const issues = gateGraphical(loadedWith([step]));
    expect(issues).toHaveLength(1);
    expect(issues[0]!.level).toBe("warn");
    expect(issues[0]!.message).toContain("600");
  });

  it("(c) silent at exactly 600 frames", () => {
    const step = pygameStep({}, {
      graphical: {
        entrypoints: { init: "make_state", update: "update", probe: "probe" },
        inputTape: [],
        dt: 1 / 60,
        frames: 600,
      },
    });
    expect(gateGraphical(loadedWith([step]))).toEqual([]);
  });

  it("(c) FIRES: inputTape longer than frames", () => {
    const step = pygameStep({}, {
      graphical: {
        entrypoints: { init: "make_state", update: "update", probe: "probe" },
        inputTape: [{}, {}, {}],
        dt: 1 / 60,
        frames: 2,
      },
    });
    const issues = gateGraphical(loadedWith([step]));
    expect(issues).toHaveLength(1);
    expect(issues[0]!.level).toBe("error");
    expect(issues[0]!.message).toMatch(/inputTape/);
  });

  // ---- clause (d): lockedRegions, when present, must cover line 1 ---------------------
  it("(d) FIRES: lockedRegions present but line 1 (the preamble) is editable", () => {
    const step = pygameStep({ lockedRegions: [{ startLine: 2, endLine: 3 }] });
    const issues = gateGraphical(loadedWith([step]));
    expect(issues).toHaveLength(1);
    expect(issues[0]!.message).toMatch(/line 1|preamble/i);
  });

  it("(d) silent: a range spanning line 1 covers the preamble", () => {
    const step = pygameStep({ lockedRegions: [{ startLine: 1, endLine: 4 }] });
    expect(gateGraphical(loadedWith([step]))).toEqual([]);
  });

  it("(d) silent: lockedRegions absent entirely (clause is conditional)", () => {
    const step = pygameStep({ lockedRegions: undefined });
    expect(gateGraphical(loadedWith([step]))).toEqual([]);
  });
});
