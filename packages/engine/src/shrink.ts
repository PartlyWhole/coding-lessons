import type { GenSpec, ElemSpec, Json } from "@trellis/schema";

type AnySpec = ElemSpec | GenSpec;
export type StillFails = (candidate: Json) => boolean;

// Candidate-smaller values for one shrink step, ordered smallest-first so the greedy
// loop converges to a minimal counterexample. Deterministic (no randomness).
export function shrinkCandidates(spec: AnySpec, value: Json): Json[] {
  switch (spec.type) {
    case "int":
    case "float": {
      const n = value as number;
      const floor = spec.min ?? 0;
      if (n === floor) return [];
      const out: Json[] = [];
      // Binary search toward the floor: floor, then halfway points.
      let lo = floor;
      let hi = n;
      out.push(floor);
      while (hi - lo > 1) {
        const mid = spec.type === "int" ? Math.floor((lo + hi) / 2) : (lo + hi) / 2;
        if (mid === lo || mid === hi) break;
        out.push(mid);
        lo = mid;
      }
      return out.filter((c) => c !== n);
    }
    case "str": {
      const s = value as string;
      if (s.length <= (spec.min ?? 0)) return [];
      // Drop one char at a time from the end, plus a halved prefix.
      const half = s.slice(0, Math.floor(s.length / 2));
      return [half, s.slice(0, s.length - 1)].filter((c) => c.length >= (spec.min ?? 0) && c !== s);
    }
    case "list": {
      const xs = value as Json[];
      if (xs.length <= (spec.min ?? 0)) return [];
      const half = xs.slice(0, Math.floor(xs.length / 2));
      return [half, xs.slice(0, xs.length - 1)].filter((c) => c.length >= (spec.min ?? 0));
    }
    case "bool":
    case "choice":
      return []; // atomic — nothing smaller to try
  }
}

export function shrink(spec: AnySpec, value: Json, stillFails: StillFails): Json {
  let current = value;
  // Greedy fixpoint: repeatedly take the smallest still-failing candidate.
  for (;;) {
    let shrunk = false;
    for (const c of shrinkCandidates(spec, current)) {
      if (stillFails(c)) {
        current = c;
        shrunk = true;
        break;
      }
    }
    if (!shrunk) return current;
  }
}
