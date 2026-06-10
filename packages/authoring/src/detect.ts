// E-16: §7 attribution-mode detect-winner port for gate 5. Mirrors BOTH reference
// implementations rank-by-rank (they were reviewed against each other):
//   - packages/engine/src/detect.ts  (specificityRank / matchedSpecificity / detect)
//   - content/verify/harness.py      (static_rank / matched_specificity / detect_winner)
// A build trigger fixture passes iff its misconception WINS the specificity-ranked
// first-match among the step's candidates; a notTrigger passes iff it does NOT win.
// NOTE on the one degenerate divergence between the references: matchedSpecificity of an
// empty `any` is Infinity in the engine (Math.min of nothing) and a crash in harness.py
// (min() of an empty generator); no schema-valid corpus signature is an empty `any`
// (sigMatch returns false for it, so the guard clause makes it unreachable here, exactly
// as in the engine where evalSignature gates the same way).
import type { Loaded, RawStep } from "./raw-types.js";
import { sigMatch, type Signals } from "./signature.js";

type Sig = Record<string, unknown>;

/** engine specificityRank / harness static_rank: structural 0, behavioral 1, generic 2. */
export function staticRank(sig: Sig): number {
  if ("astTag" in sig || "choice" in sig || "recallEquals" in sig) return 0;
  if ("testFailure" in sig || "propertyFailed" in sig) return 1;
  if ("runError" in sig || "timedOut" in sig) return 2;
  if ("all" in sig) {
    const all = sig["all"] as Sig[];
    return all.length ? Math.min(...all.map(staticRank)) : 3;
  }
  if ("any" in sig) {
    const any = sig["any"] as Sig[];
    return any.length ? Math.min(...any.map(staticRank)) : 3;
  }
  if ("not" in sig) return staticRank(sig["not"] as Sig);
  return 3;
}

/** engine matchedSpecificity: rank by the MOST specific leaf that actually fired
 * (Infinity when the signature does not match at all). */
export function matchedSpecificity(sig: Sig, signals: Signals): number {
  if (!sigMatch(sig, signals)) return Infinity;
  if ("astTag" in sig || "choice" in sig || "recallEquals" in sig) return 0;
  if ("testFailure" in sig || "propertyFailed" in sig) return 1;
  if ("runError" in sig || "timedOut" in sig) return 2;
  if ("any" in sig) {
    return Math.min(...(sig["any"] as Sig[]).map((s) => matchedSpecificity(s, signals)));
  }
  if ("all" in sig) {
    const all = sig["all"] as Sig[];
    return all.length ? Math.min(...all.map((s) => matchedSpecificity(s, signals))) : 3;
  }
  if ("not" in sig) {
    // A matched `not` has no positive leaf (sig is true, so sig.not is FALSE — recursing
    // would return Infinity). Rank by the STATIC specificity of what it negates. Do NOT
    // "simplify" this into a recursive matchedSpecificity call (engine detect.ts, verbatim).
    return staticRank(sig["not"] as Sig);
  }
  return 3;
}

/** engine detect / harness detect_winner: first-match within the step's skills,
 * tie-break (matchedSpecificity, then staticRank, then stable id order). */
export function detectWinner(loaded: Loaded, step: RawStep, signals: Signals): string | null {
  const candidates: string[] = [];
  for (const skillId of (step["skills"] as string[] | undefined) ?? []) {
    for (const m of loaded.skills[skillId]?.misconceptions ?? []) {
      if (sigMatch(m.signature as Sig, signals)) candidates.push(m.id);
    }
  }
  if (candidates.length === 0) return null;
  const unique = [...new Set(candidates)];
  unique.sort((a, b) => {
    const sa = loaded.miscons[a]!.signature as Sig;
    const sb = loaded.miscons[b]!.signature as Sig;
    const ma = matchedSpecificity(sa, signals);
    const mb = matchedSpecificity(sb, signals);
    if (ma !== mb) return ma - mb;
    const ra = staticRank(sa);
    const rb = staticRank(sb);
    if (ra !== rb) return ra - rb;
    return a < b ? -1 : a > b ? 1 : 0;
  });
  return unique[0]!;
}
