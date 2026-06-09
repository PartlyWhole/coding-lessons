import type { PropertyConfig, GenSpec, Json } from "@trellis/schema";
import type { BuildSandbox } from "./buildSandbox.js";
import { makePrng } from "./prng.js";
import { genArgs } from "./generators.js";
import { compareValues, type Comparator } from "./compare.js";
import { shrinkCandidates } from "./shrink.js";
import { entrypointDriver, parseDriverStdout } from "./pyDriver.js";

export interface PropertyResult {
  passed: boolean;
  counterexample?: Json;
}

const RUN = { timeoutMs: 5000, memoryMb: 256 };

// Run one entrypoint(args) and return its value, or undefined on any run error.
async function call(
  sandbox: BuildSandbox,
  code: string,
  entrypoint: string,
  args: Json[],
  seed: number,
): Promise<Json | undefined> {
  const driver = entrypointDriver({ code, entrypoint, args, seed });
  const res = await sandbox.run({ code: driver, timeoutMs: RUN.timeoutMs, memoryMb: RUN.memoryMb });
  if (res.error || res.timedOut || !res.ran) return undefined;
  const parsed = parseDriverStdout(res.stdout);
  return parsed.ok ? parsed.value : undefined;
}

// §6.4 property test. Generators seeded from property.seed; learner + oracle each seeded
// identically per call so any internal randomness (random.randint) is reproducible. On
// the first mismatch, shrink the failing argument tuple to a minimal counterexample.
export async function runProperty(
  property: PropertyConfig,
  entrypoint: string,
  code: string,
  sandbox: BuildSandbox,
): Promise<PropertyResult> {
  const comparator = property.comparator as Comparator | undefined;
  const prng = makePrng(property.seed);
  const memo = new Map<string, boolean>(); // argsKey -> diverges?

  // True iff learner and oracle disagree (or learner errors) on this arg tuple.
  const diverges = async (args: Json[]): Promise<boolean> => {
    const key = JSON.stringify(args);
    const cached = memo.get(key);
    if (cached !== undefined) return cached;
    const learner = await call(sandbox, code, entrypoint, args, property.seed);
    const oracle = await call(sandbox, property.referenceImpl, "sol", args, property.seed);
    // Oracle is trusted; if it errored we cannot blame the learner -> treat as non-diverging.
    const bad = oracle === undefined ? false : learner === undefined || !compareValues(comparator, learner, oracle);
    memo.set(key, bad);
    return bad;
  };

  for (let i = 0; i < property.numCases; i++) {
    const args = genArgs(property.generators, prng);
    // eslint-disable-next-line no-await-in-loop
    if (await diverges(args)) {
      // Shrink each argument independently, left to right, holding the others fixed.
      const minimal = [...args];
      for (let j = 0; j < minimal.length; j++) {
        const spec = property.generators[j]!;
        // eslint-disable-next-line no-await-in-loop
        minimal[j] = await shrinkArg(spec, minimal[j]!, j, minimal, diverges);
      }
      return { passed: false, counterexample: minimal };
    }
  }
  return { passed: true };
}

// Shrink one positional argument while the whole tuple still diverges. shrinkCandidates
// gives smaller-first candidates; we greedily take the first that still diverges. Async
// over `diverges`, so we cannot use the sync shrink() directly.
async function shrinkArg(
  spec: GenSpec,
  value: Json,
  index: number,
  tuple: Json[],
  diverges: (args: Json[]) => Promise<boolean>,
): Promise<Json> {
  let current = value;
  for (;;) {
    let advanced = false;
    for (const c of shrinkCandidates(spec, current)) {
      const probe = [...tuple];
      probe[index] = c;
      // eslint-disable-next-line no-await-in-loop
      if (await diverges(probe)) {
        current = c;
        tuple[index] = c;
        advanced = true;
        break;
      }
    }
    if (!advanced) return current;
  }
}
