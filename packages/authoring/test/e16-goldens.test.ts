// E-16 goldens: the content track's 9 pre-migration co-fire fixtures (extracted from
// content-authoring @ 98fcb25^, the forms that PASSED harness.py's attribution gate but
// FAILED the stale isolated-match TS gate). Each golden embeds the REAL picked step and
// every candidate misconception signature of the step's skills — no dependency on the
// content branch. Assertions per golden:
//   1. the loser's signature DOES match in isolation (mutation evidence: the pre-E-16
//      gate would have failed the notTrigger),
//   2. detectWinner attributes the co-fire to the winner, not the loser,
//   3. gateFixtures (attribution mode) passes the loser notTrigger AND the winner
//      trigger carrying the same code,
//   4. cross-implementation differential: harness.py gate 5 on the same mini-corpus
//      agrees (PASS) — any disagreement here is a hold-and-escalate event, not a test
//      to weaken.
// NOTE: step test cases were trimmed to the first case (no golden signature uses
// testFailure.caseIndex, so attribution is unaffected; it bounds timeout-laden runs).
import { describe, it, expect } from "vitest";
import { resolve } from "node:path";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import goldens from "./fixtures/e16-goldens.json";
import type { Loaded, RawMiscon, RawStep } from "../src/raw-types.js";
import { signalsFor } from "../src/signals.js";
import { sigMatch } from "../src/signature.js";
import { detectWinner } from "../src/detect.js";
import { gateFixtures } from "../src/gates/fixtures.js";

const HARNESS = resolve(__dirname, "../../../content/verify/harness.py");

interface Golden {
  name: string;
  loserMid: string;
  winnerMid: string;
  code: string;
  step: RawStep;
  candidates: Record<string, { id: string; signature: unknown }[]>;
}

function buildLoaded(g: Golden, withFixtures: boolean): Loaded {
  const skills: Loaded["skills"] = {};
  const miscons: Loaded["miscons"] = {};
  for (const [sid, cands] of Object.entries(g.candidates)) {
    const ms: RawMiscon[] = cands.map((c) => ({
      id: c.id,
      skill: sid,
      title: "",
      signature: c.signature as RawMiscon["signature"],
      hintLadder: [],
      feedback: "",
      _skill: sid,
    }));
    skills[sid] = { id: sid, title: "", description: "", misconceptions: ms };
    for (const m of ms) miscons[m.id] = m;
  }
  if (withFixtures) {
    miscons[g.loserMid]!.notTriggers = [{ stepKind: "build", code: g.code }];
    miscons[g.winnerMid]!.triggers = [{ stepKind: "build", code: g.code }];
  }
  const stepSkills = (g.step["skills"] as string[]) ?? [];
  return {
    nodes: {
      "node.g": {
        id: "node.g",
        title: "",
        track: "spine",
        teaches: stepSkills,
        cells: [{ id: "cell.g", title: "", certifies: stepSkills, steps: [g.step] }],
      },
    },
    skills,
    miscons,
  };
}

/** Write the mini-corpus as JSON-shaped YAML (JSON is valid YAML 1.2) and run the REAL
 * harness.py gate 5 against it. */
function harnessVerdict(g: Golden): { pass: boolean; out: string } {
  const root = mkdtempSync(join(tmpdir(), `e16-${g.name}-`));
  try {
    mkdirSync(join(root, "content/nodes"), { recursive: true });
    mkdirSync(join(root, "content/skills"), { recursive: true });
    const stepSkills = (g.step["skills"] as string[]) ?? [];
    writeFileSync(
      join(root, "content/nodes/g.yaml"),
      JSON.stringify({
        node: {
          id: "node.g", title: "", track: "spine", teaches: stepSkills,
          cells: [{ id: "cell.g", title: "", certifies: stepSkills, steps: [g.step] }],
        },
      }),
    );
    let skillDocs = "";
    for (const [sid, cands] of Object.entries(g.candidates)) {
      const misconceptions = cands.map((c) => ({
        id: c.id, skill: sid, title: "", signature: c.signature, feedback: "", hintLadder: [],
        ...(c.id === g.loserMid ? { notTriggers: [{ stepKind: "build", code: g.code }] } : {}),
        ...(c.id === g.winnerMid ? { triggers: [{ stepKind: "build", code: g.code }] } : {}),
      }));
      skillDocs +=
        JSON.stringify({ skill: { id: sid, title: "", description: "", misconceptions } }) + "\n---\n";
    }
    writeFileSync(join(root, "content/skills/g.yaml"), skillDocs);
    const r = spawnSync("python3", [HARNESS], { cwd: root, encoding: "utf8", maxBuffer: 1 << 24 });
    return { pass: /RESULT gate5: PASS/.test(r.stdout), out: r.stdout + r.stderr };
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

describe("E-16 goldens: 9 migrated winner-trigger cases, judged the way harness.py judges them", () => {
  for (const g of goldens as unknown as Golden[]) {
    it(`${g.name}: ${g.loserMid} co-fires but LOSES to ${g.winnerMid}`, { timeout: 120_000 }, () => {
      const loaded = buildLoaded(g, true);
      const loser = loaded.miscons[g.loserMid]!;

      // signals as gate 5 computes them (needs unioned across all candidates)
      const s = signalsFor({ stepKind: "build", code: g.code }, loser, loaded);
      expect(s._error).toBeUndefined();
      expect(s._step).toBeDefined();

      // 1. mutation evidence: isolated matching (the stale pre-E-16 gate) FIRES on the loser
      expect(sigMatch(loser.signature as Record<string, unknown>, s)).toBe(true);

      // 2. attribution: the winner outranks the loser
      expect(detectWinner(loaded, s._step!, s)).toBe(g.winnerMid);

      // 3. the ported gate passes both the loser notTrigger and the winner trigger
      expect(gateFixtures(loaded).filter((i) => i.level === "error")).toEqual([]);

      // 4. cross-implementation differential: the real harness.py agrees
      const hv = harnessVerdict(g);
      expect(hv.pass, `harness.py disagreed on ${g.name} (HOLD-AND-ESCALATE):\n${hv.out}`).toBe(true);
    });
  }
});
