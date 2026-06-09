import { describe, it, expect } from "vitest";
import type { Bundle, Step, RunRequest, RunResult, AstQuery } from "@trellis/schema";
import type { BuildSandbox } from "@trellis/engine";
import { memoryDriver, openTrellisDb, loadLearnerModel, readDiagnoses } from "@trellis/persist";
import { gradeStep, persistDiagnosis } from "../src/runner/grade.js";

function miniBundle(): Bundle {
  return {
    contentVersion: "v1",
    skills: { "skill.x": { id: "skill.x", title: "X", description: "", misconceptions: ["mis.x"], upstream: [] } },
    nodes: {}, cells: {},
    misconceptions: {
      "mis.x": { id: "mis.x", skill: "skill.x", title: "X mis", signature: { choice: "wrong" },
        hintLadder: [{ level: 1, body: "h1" }], feedback: "the X feedback" },
    },
    producers: {}, requirements: {},
  } as unknown as Bundle;
}

const recognize: Step = {
  id: "s1", kind: "recognize", prompt: "pick", skills: ["skill.x"],
  correctChoiceId: "right",
  choices: [{ id: "right", label: "Right" }, { id: "wrong", label: "Wrong", misconception: "mis.x" }],
} as Step;

const noSandbox: BuildSandbox = {
  run: async (_req: RunRequest): Promise<RunResult> => ({ ran: true, stdout: "", wallMs: 0, timedOut: false }),
  parseAndMatch: async (_c: string, _q: { tag: string; query: AstQuery }[]) => [],
};

const fx = { newId: () => "diag-1", now: () => "2026-01-01T00:00:00Z", learnerId: "L" };

describe("gradeStep", () => {
  it("diagnoses a correct recognize answer as pass", async () => {
    const d = await gradeStep(recognize, { kind: "recognize", choiceId: "right" }, noSandbox, miniBundle(), fx);
    expect(d.correct).toBe(true);
    expect(d.attribution).toBe("pass");
  });
  it("diagnoses a wrong recognize answer as the authored misconception", async () => {
    const d = await gradeStep(recognize, { kind: "recognize", choiceId: "wrong" }, noSandbox, miniBundle(), fx);
    expect(d.correct).toBe(false);
    expect(d.attribution).toBe("misconception");
    expect(d.misconceptionId).toBe("mis.x");
  });
});

describe("persistDiagnosis", () => {
  it("applies §10.2 mastery + commits atomically; survives reload", async () => {
    const driver = memoryDriver();
    const bundle = miniBundle();
    const db1 = await openTrellisDb(driver, { idGen: () => "L" });
    const d = await gradeStep(recognize, { kind: "recognize", choiceId: "right" }, noSandbox, bundle, fx);
    await persistDiagnosis(db1, bundle, d, []);
    const m1 = await loadLearnerModel(db1, "v1");
    expect(m1.skills["skill.x"]!.mastery).toBeGreaterThan(0);
    db1.close();

    const db2 = await openTrellisDb(driver, { idGen: () => "X" });
    const m2 = await loadLearnerModel(db2, "v1");
    const hist = await readDiagnoses(db2);
    expect(m2.skills["skill.x"]!.mastery).toBe(m1.skills["skill.x"]!.mastery);
    expect(hist).toHaveLength(1);
  });
});

// --- appended: marquee str_num diagnosis through the real CPython twin ---
import { readFileSync as _read } from "node:fs";
import { execSync as _exec } from "node:child_process";
import { createLocalSandbox } from "@trellis/sandbox";
import type { Bundle as _Bundle, Cell as _Cell, BuildStep as _BuildStep } from "@trellis/schema";

function _realBundle(): _Bundle {
  const out = "/tmp/trellis-grade-bundle.json";
  _exec(`node ${process.cwd()}/../authoring/dist/src/cli.js build --out ${out} --content ${process.cwd()}/../../content`, { stdio: "ignore" });
  return JSON.parse(_read(out, "utf8")) as _Bundle;
}

describe("marquee build diagnosis (real CPython twin)", () => {
  it("'...: ' + number → mis.concat.str_num; str() coercion → pass", async () => {
    const bundle = _realBundle();
    const cell = bundle.cells["cell.string_concat.text_plus_number"] as _Cell;
    const step = cell.steps.find((s) => s.kind === "build") as _BuildStep;
    const twin = createLocalSandbox();
    const fx2 = { newId: () => "dx", now: () => "2026-01-01T00:00:00Z", learnerId: "L" };

    const bug = await gradeStep(step, { kind: "build", code: 'def announce(number):\n    return "Your random number is: " + number\n' }, twin, bundle, fx2);
    expect(bug.correct).toBe(false);
    expect(bug.misconceptionId).toBe("mis.concat.str_num");

    const ok = await gradeStep(step, { kind: "build", code: 'def announce(number):\n    return "Your random number is: " + str(number)\n' }, twin, bundle, fx2);
    expect(ok.correct).toBe(true);
    expect(ok.attribution).toBe("pass");
  }, 30000);
});
