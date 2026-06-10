// Ports content/verify/harness.py gate-6 (lines 293-321) + its _sample helper: for every
// `build` step that carries a `property.referenceImpl`, sample the step's generators and run
// `print(repr(sol(<sampled args>)))`, flagging any step whose oracle fails to parse or run.
import type { Loaded, RawStep } from "../raw-types.js";
import { runCases, type CaseSpec } from "../ast/python.js";
import type { GateIssue } from "./types.js";

const G = "6-oracle";

interface Gen {
  param: string;
  type: string;
  min?: number;
  choices?: unknown[];
}

function sample(g: Gen): unknown {
  switch (g.type) {
    case "int":
    case "float":
      return g.min ?? 0;
    case "str":
      return "ab";
    case "bool":
      return true;
    case "list":
      return [];
    case "choice":
      return (g.choices ?? [0])[0];
    default:
      return 0;
  }
}

export function gateOracle(loaded: Loaded): GateIssue[] {
  const issues: GateIssue[] = [];
  // Collect every oracle spec, then run them all in ONE python3 batch (speedup plan).
  const pending: { st: RawStep; spec: CaseSpec }[] = [];
  for (const n of Object.values(loaded.nodes)) {
    for (const c of n.cells) {
      for (const st of c.steps as RawStep[]) {
        if (st.kind !== "build") continue;
        const ev = st["evaluator"] as { property?: { referenceImpl: string; generators?: Gen[] } };
        const prop = ev.property;
        if (!prop) continue;
        const gens = prop.generators ?? [];
        const args = gens.map(sample);
        // runCases entrypoint mode builds `print(repr(sol(args)))` internally and reports
        // errType for any syntax/runtime error regardless of `expected` — so errType !== null
        // is exactly the harness's ORACLE FAIL condition. We pass expected: null (only affects
        // `ok`, which we ignore).
        pending.push({ st, spec: { code: prop.referenceImpl, mode: "entrypoint", entry: "sol", args, expected: null } });
      }
    }
  }
  const results = runCases(pending.map((p) => p.spec));
  results.forEach((r, i) => {
    if (r.errType !== null) {
      issues.push({ gate: G, level: "error", message: `${pending[i]!.st.id}: oracle ${r.errType} error on sampled generators` });
    }
  });
  return issues;
}
