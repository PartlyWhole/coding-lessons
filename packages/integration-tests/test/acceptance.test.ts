import { describe, it, expect } from "vitest";
import { evaluate } from "@trellis/engine";
import { createLocalSandbox } from "@trellis/sandbox";
import { loadRawContent } from "./_fixtures.js";

type Any = any;

const content = loadRawContent();
const sandbox = createLocalSandbox();
const fx = { id: "d", learnerId: "L", now: "2026-06-08T00:00:00.000Z" };

// Find a build step by its exact id across the raw content nodes.
function findStep(stepId: string): Any {
  for (const node of Object.values(content.nodes) as Any[]) {
    for (const cell of node.cells ?? []) {
      for (const st of cell.steps ?? []) if (st.id === stepId) return st;
    }
  }
  throw new Error(`build step ${stepId} not found`);
}

// A minimal Bundle: the step's skills + their misconceptions, harvested from raw content.
function bundleFor(step: Any): Any {
  const skills: Any = {};
  const misconceptions: Any = {};
  for (const sid of step.skills as string[]) {
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
  return { contentVersion: "acceptance@1", skills, misconceptions, nodes: {}, cells: {}, producers: {}, requirements: {} };
}

describe("§4 acceptance - string_concat str_num (announce)", () => {
  const step = findStep("cell.string_concat.text_plus_number#4");
  const bundle = bundleFor(step);

  it("both f-string and str() coercion PASS (correct-but-unanticipated)", { timeout: 60_000 }, async () => {
    const fstr = await evaluate(step, { kind: "build", code: 'def announce(number):\n    return f"Your random number is: {number}"' }, sandbox, bundle, fx);
    const concat = await evaluate(step, { kind: "build", code: 'def announce(number):\n    return "Your random number is: " + str(number)' }, sandbox, bundle, fx);
    expect(fstr.correct).toBe(true);
    expect(fstr.attribution).toBe("pass");
    expect(concat.correct).toBe(true);
    expect(concat.attribution).toBe("pass");
  });

  it("text + raw number is attributed to the str_num misconception, never pass", { timeout: 60_000 }, async () => {
    const bad = await evaluate(step, { kind: "build", code: 'def announce(number):\n    return "Your random number is: " + number' }, sandbox, bundle, fx);
    expect(bad.correct).toBe(false);
    // The TypeError surfaces as runError:runtime, which detect() maps to the authored
    // misconception (mis.concat.str_num, signature any:[{runError:runtime},{choice:a}]) —
    // proving the full detection chain end-to-end, not merely "not a pass".
    expect(bad.attribution).toBe("misconception");
    expect(bad.misconceptionId).toBe("mis.concat.str_num");
  });
});

describe("§4 acceptance - determinism (random get_random)", () => {
  const step = findStep("cell.random.build#2");
  const bundle = bundleFor(step);

  it("same (submission, seed) -> identical Diagnosis for an off-by-one", { timeout: 60_000 }, async () => {
    const code = "import random\n\ndef get_random(a, b):\n    return random.randint(a, b - 1)";
    const a = await evaluate(step, { kind: "build", code }, sandbox, bundle, fx);
    const b = await evaluate(step, { kind: "build", code }, sandbox, bundle, fx);
    expect(a.signals).toEqual(b.signals);
    expect(a).toEqual(b);
    expect(a.correct).toBe(false);
  });

  it("a correct randint solution passes (property holds under the seed)", { timeout: 60_000 }, async () => {
    const code = "import random\n\ndef get_random(a, b):\n    return random.randint(a, b)";
    const d = await evaluate(step, { kind: "build", code }, sandbox, bundle, fx);
    expect(d.correct).toBe(true);
    expect(d.attribution).toBe("pass");
  });
});
