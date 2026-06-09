import { describe, it, expect } from "vitest";
import { assembleBuildSignals, detect } from "@trellis/engine";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { createLocalSandbox } from "../src/local-cpython.js";
import { loadRawContent, pickBuildStep } from "./_fixtures.js";

type Any = any; // intentional: test works with raw YAML content of unknown shape

const content = loadRawContent();
const sandbox = createLocalSandbox();

// Compute signals via the REAL ladder (no stripping: the test runner reads property.seed
// to seed the random node's cases, exactly as harness.py does). assembleBuildSignals only
// RUNS property when tests pass; running it on a correct solution returns passed=true and
// never changes a signature outcome — so it is harmless and still agrees with harness.
async function signalsForBuild(step: Any, code: string) {
  return assembleBuildSignals(step, code, sandbox);
}

// §7 attribution context: build fixtures are judged the way the live engine judges them —
// the misconception must WIN (trigger) or NOT WIN (notTrigger) detect()'s specificity-ranked
// first-match among the step's candidates. Mirrors harness.py's detect_winner (gate 5),
// updated together with the mis.loop.infinite_true { timedOut: true } re-key: a never-updating
// `while cond:` also times out and matches the timedOut branch in isolation, but structural
// mis.loop.no_update outranks it. (Design-note §5 option (a), 2026-06-09 verification session.)
function bundleForStep(step: Any): Any {
  const skills: Any = {};
  const misconceptions: Any = {};
  for (const sid of (step.skills ?? []) as string[]) {
    const s = content.skills[sid];
    if (!s) continue;
    skills[sid] = {
      id: s.id, title: s.title ?? sid, description: s.description ?? "",
      misconceptions: (s.misconceptions ?? []).map((m: Any) => m.id), upstream: s.upstream ?? [],
    };
    for (const m of (s.misconceptions ?? []) as Any[]) {
      misconceptions[m.id] = {
        ...m, skill: m.skill ?? m._skill,
        hintLadder: m.hintLadder ?? [], feedback: m.feedback ?? "", skillDeltas: m.skillDeltas ?? [],
      };
    }
  }
  return { contentVersion: "differential@1", skills, misconceptions, nodes: {}, cells: {}, producers: {}, requirements: {} };
}

describe("21-fixture differential: evaluate+parseAndMatch agree with harness.py gate 5", () => {
  const buildBearing = Object.values(content.miscons).filter((m: Any) =>
    [...(m.triggers ?? []), ...(m.notTriggers ?? [])].some((f: Any) => f.stepKind === "build"),
  );

  it("covers the build-bearing misconceptions", () => {
    expect(buildBearing.length).toBeGreaterThan(0);
  });

  for (const mis of buildBearing as Any[]) {
    it(`${mis.id}: build triggers fire, build non-triggers stay silent`, { timeout: 120_000 }, async () => {
      const step = pickBuildStep(content, mis);
      expect(step, `no build step surfaces ${mis.id}`).not.toBeNull();
      let exercised = 0;
      for (const [label, want] of [["triggers", true], ["notTriggers", false]] as const) {
        for (const fix of (mis[label] ?? []) as Any[]) {
          if (fix.stepKind !== "build") continue;
          exercised++;
          const signals = await signalsForBuild(step, fix.code as string);
          const got = detect(step, { signals }, bundleForStep(step)) === mis.id;
          expect(
            got,
            `${mis.id} ${label} code=${JSON.stringify(fix.code)} signals=${JSON.stringify(signals)}`,
          ).toBe(want);
        }
      }
      expect(exercised).toBeGreaterThan(0);
    });
  }

  it("content/verify/harness.py itself exits 0 (the oracle we agree with is valid)", { timeout: 60_000 }, () => {
    const repo = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
    const proc = spawnSync("python3", ["content/verify/harness.py"], { cwd: repo, encoding: "utf-8" });
    expect(proc.status, proc.stdout + proc.stderr).toBe(0);
  });
});
