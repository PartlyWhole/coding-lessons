// E-15 synthetic differential: crashed/timed-out runs must produce the SAME signals shape
// and the SAME gate-5 verdicts in the TS twin and in content/verify/harness.py, both
// mirroring engine assembleBuildSignals (evaluate.ts):
//   - bare input-free run killed by the watchdog (`!bare.ran`) -> ran=false, timedOut,
//     NO tests, NO runError (the engine short-circuits before the test runner);
//   - a module-level runtime fault -> ran stays true in the worker harness
//     (run-harness.py reports ran=true for exec exceptions), the engine PROCEEDS to
//     runTests, so signals carry runError:runtime AND tests (failures with got=null).
//     This is engine reality verified empirically against the local-CPython twin: the
//     "tests never ran on a crashed run" reading holds only for !ran (timeout/syntax/
//     worker-crash), NOT for module-level runtime errors.
import { describe, it, expect } from "vitest";
import { resolve } from "node:path";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import type { Loaded, RawMiscon, RawStep } from "../src/raw-types.js";
import { buildSignals, signalsFor } from "../src/signals.js";
import { gateFixtures } from "../src/gates/fixtures.js";

const HARNESS = resolve(__dirname, "../../../content/verify/harness.py");

const STEP: RawStep = {
  id: "cell.x#1",
  kind: "build",
  skills: ["skill.x"],
  evaluator: {
    run: { timeoutMs: 5000, memoryMb: 256 },
    tests: { cases: [{ input: "", expected: "hi\n" }] },
    ast: {
      queries: [
        { tag: "no_print_call", query: { not: { node: "Call", where: { calls: "print" } } } },
      ],
    },
  },
};

// the content track's withheld-fixture shape (voice-memory mis.print.no_call):
// testFailure-gated astTag + a timedOut-keyed sibling so needs include both.
const MISCONS: { id: string; signature: unknown }[] = [
  { id: "mis.x.no_call", signature: { all: [{ astTag: "no_print_call" }, { testFailure: {} }] } },
  { id: "mis.x.hangs", signature: { timedOut: true } },
];

function mkLoaded(triggers: Record<string, { code: string }[]>, notTriggers: Record<string, { code: string }[]>): Loaded {
  const miscons: Record<string, RawMiscon> = {};
  for (const m of MISCONS) {
    miscons[m.id] = {
      id: m.id, skill: "skill.x", title: "", signature: m.signature as RawMiscon["signature"],
      hintLadder: [], feedback: "", _skill: "skill.x",
      triggers: (triggers[m.id] ?? []).map((t) => ({ stepKind: "build" as const, code: t.code })),
      notTriggers: (notTriggers[m.id] ?? []).map((t) => ({ stepKind: "build" as const, code: t.code })),
    };
  }
  return {
    nodes: {
      "node.x": {
        id: "node.x", title: "", track: "spine", teaches: ["skill.x"],
        cells: [{ id: "cell.x", title: "", certifies: ["skill.x"], steps: [STEP] }],
      },
    },
    skills: { "skill.x": { id: "skill.x", title: "", description: "", misconceptions: Object.values(miscons) } },
    miscons,
  };
}

function harnessGate5(loaded: Loaded): { pass: boolean; out: string } {
  const root = mkdtempSync(join(tmpdir(), "e15-"));
  try {
    mkdirSync(join(root, "content/nodes"), { recursive: true });
    mkdirSync(join(root, "content/skills"), { recursive: true });
    writeFileSync(join(root, "content/nodes/x.yaml"), JSON.stringify({ node: loaded.nodes["node.x"] }));
    const skill = loaded.skills["skill.x"]!;
    writeFileSync(join(root, "content/skills/x.yaml"), JSON.stringify({ skill }));
    const r = spawnSync("python3", [HARNESS], { cwd: root, encoding: "utf8", maxBuffer: 1 << 24 });
    return { pass: /RESULT gate5: PASS/.test(r.stdout), out: r.stdout + r.stderr };
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

const NEEDS = new Set(["astTag", "testFailure", "timedOut", "runError"]);

describe("E-15 differential: crashed/timed-out runs (TS twin vs harness.py vs engine semantics)", () => {
  it("bare watchdog kill: timedOut signal, NO tests (the assembleBuildSignals short-circuit)", () => {
    const s = buildSignals("while True:\n    pass\n", STEP, NEEDS);
    expect(s.ran).toBe(false);
    expect(s.timedOut).toBe(true);
    expect(s.tests).toBeNull(); // signals carry NO test results
    expect(s.runError).toBeNull(); // the kill is timedOut, never a runError
  }, 30_000);

  it("module-level runtime fault: ran stays true, tests ARE computed (engine parity)", () => {
    const s = buildSignals('pront("hi")\n', STEP, NEEDS);
    expect(s.ran).toBe(true);
    expect(s.timedOut).toBeUndefined();
    expect(s.runError).toEqual({ type: "runtime" });
    expect(s.tests).toEqual({ failed: 1, failures: [0] }); // the engine proceeds to runTests
  }, 30_000);

  it("gate-5 verdicts agree with harness.py on both shapes (subprocess differential)", () => {
    // timed-out program: {timedOut} fires and WINS (no_call's testFailure leg cannot fire
    // without tests); no_call must NOT win on it.
    const hang = "while True:\n    pass\n";
    const loaded = mkLoaded(
      { "mis.x.hangs": [{ code: hang }] },
      { "mis.x.no_call": [{ code: hang }] },
    );
    expect(gateFixtures(loaded).filter((i) => i.level === "error")).toEqual([]);
    const hv = harnessGate5(loaded);
    expect(hv.pass, `harness disagreed (HOLD-AND-ESCALATE):\n${hv.out}`).toBe(true);

    const sHang = signalsFor({ stepKind: "build", code: hang }, loaded.miscons["mis.x.hangs"]!, loaded);
    expect(sHang.timedOut).toBe(true);
    expect(sHang.tests).toBeNull();
  }, 60_000);

  it("gate-5 verdicts agree with harness.py on the module-level-crash shape", () => {
    // pront crash: tests computed -> no_call's {astTag + testFailure} all-branch FIRES and
    // wins (rank 0 beats hangs' non-match). Both implementations must agree it wins.
    const crash = 'pront("hi")\n';
    const loaded = mkLoaded({ "mis.x.no_call": [{ code: crash }] }, {});
    expect(gateFixtures(loaded).filter((i) => i.level === "error")).toEqual([]);
    const hv = harnessGate5(loaded);
    expect(hv.pass, `harness disagreed (HOLD-AND-ESCALATE):\n${hv.out}`).toBe(true);
  }, 60_000);
});
