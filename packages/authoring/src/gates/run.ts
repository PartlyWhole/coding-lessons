import type { Loaded } from "../raw-types.js";
import type { Bundle } from "@trellis/schema";
import type { GateIssue, GateReport } from "./types.js";
import { gateSchema } from "./schema-gate.js";
import { gateReferential } from "./referential.js";
import { gateDag } from "./dag.js";
import { gateGranularity } from "./granularity.js";
import { gateFixtures } from "./fixtures.js";
import { gateOracle } from "./oracle.js";
import { gateGolden } from "./golden.js";
import { gateAnswerable } from "./answerable.js";
import { gateCorrectChoiceMiscon } from "./correct-choice-miscon.js";
import { lintWhereCombinators } from "../lints/where-combinators.js";
import { lintSpineExtension } from "../lints/spine-extension.js";
import { lintRe2Patterns } from "../lints/re2-pattern.js";

export interface GateOptions {
  // gates 5/6 shell out to python3; allow skipping (CLI --no-exec, or fast structural checks).
  runExecGates?: boolean;
}

export function runAllGates(loaded: Loaded, bundle: Bundle, opts: GateOptions = {}): GateReport {
  const runExec = opts.runExecGates !== false;
  const issues: GateIssue[] = [
    ...gateSchema(bundle),
    ...gateReferential(loaded),
    ...gateDag(loaded),
    ...gateGranularity(loaded),
    ...lintWhereCombinators(loaded),
    ...lintSpineExtension(loaded),
    ...lintRe2Patterns(loaded),
    ...(runExec ? gateFixtures(loaded) : []),
    ...(runExec ? gateOracle(loaded) : []),
    ...gateGolden(loaded),
    ...gateAnswerable(loaded), // gate 8 (pure, mirrors engine §8 matching)
    ...gateCorrectChoiceMiscon(loaded), // gate 9 (pure, mirrors directMisconception reachability)
  ];
  const cells = Object.values(loaded.nodes).reduce((acc, n) => acc + n.cells.length, 0);
  return {
    ok: !issues.some((i) => i.level === "error"),
    issues,
    stats: {
      nodes: Object.keys(loaded.nodes).length,
      skills: Object.keys(loaded.skills).length,
      misconceptions: Object.keys(loaded.miscons).length,
      cells,
    },
  };
}
