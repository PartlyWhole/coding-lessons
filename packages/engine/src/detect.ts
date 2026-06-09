import type { Signature, RawSignals, Step, Bundle, Json } from "@trellis/schema";
import { normalize } from "./normalize.js";
import { deepEqual } from "./deepEqual.js";

// §7 — the learner's submission for non-build steps is threaded here (the frozen
// RawSignals has no choice/recall field). Build-path forms read from `signals`.
export interface DetectContext {
  signals: RawSignals;
  choiceId?: string; // recognize / predict (choice mode)
  recallText?: string; // recall / predict (text mode)
}

function matchTestFailure(
  signals: RawSignals,
  pred: { caseIndex?: number; gotEquals?: Json },
): boolean {
  const tests = signals.tests;
  if (!tests || tests.failed === 0) return false;
  let failures = tests.failures;
  if (pred.caseIndex !== undefined) {
    failures = failures.filter((f) => f.caseIndex === pred.caseIndex);
  }
  if (failures.length === 0) return false;
  if (pred.gotEquals !== undefined) {
    return failures.some((f) => deepEqual(f.got, pred.gotEquals as Json));
  }
  return true;
}

// §7 evalSignature — pure boolean recursion over the frozen Signature union.
export function evalSignature(sig: Signature, ctx: DetectContext): boolean {
  if ("astTag" in sig) return (ctx.signals.astTags ?? []).includes(sig.astTag);
  if ("runError" in sig) return ctx.signals.runError?.type === sig.runError;
  if ("timedOut" in sig) return ctx.signals.timedOut === true;
  if ("testFailure" in sig) return matchTestFailure(ctx.signals, sig.testFailure);
  if ("propertyFailed" in sig) return ctx.signals.property?.passed === false;
  if ("choice" in sig) return ctx.choiceId === sig.choice;
  if ("recallEquals" in sig) {
    return ctx.recallText !== undefined && normalize(ctx.recallText) === normalize(sig.recallEquals);
  }
  if ("all" in sig) return sig.all.every((s) => evalSignature(s, ctx));
  if ("any" in sig) return sig.any.some((s) => evalSignature(s, ctx));
  if ("not" in sig) return !evalSignature(sig.not, ctx);
  return false;
}

// §7 specificity — structural/direct signatures (0) beat behavioral (1) beat generic
// errors (2). Composites take the most-specific (min) leaf rank. NOTE: the frozen
// Misconception has no `priority` field, so this rank + stable id order is the whole
// tie-break (the §7 "authored priority int" step is dropped).
export function specificityRank(sig: Signature): number {
  if ("astTag" in sig || "choice" in sig || "recallEquals" in sig) return 0;
  if ("testFailure" in sig || "propertyFailed" in sig) return 1;
  if ("runError" in sig || "timedOut" in sig) return 2;
  if ("all" in sig) return sig.all.length ? Math.min(...sig.all.map(specificityRank)) : 3;
  if ("any" in sig) return sig.any.length ? Math.min(...sig.any.map(specificityRank)) : 3;
  if ("not" in sig) return specificityRank(sig.not);
  return 3;
}

// §7 match-aware specificity — rank a signature by the MOST specific leaf that actually
// evaluates true for these signals (Infinity if it doesn't match at all). This is what the
// cross-candidate tie-break needs once a misconception's `any` mixes a structural branch
// (astTag, rank 0) with a runtime branch (timedOut, rank 2): the candidate that matched via
// the runtime branch must lose to one that matched structurally, even though both signatures
// statically contain a rank-0 branch. See design-note §5 (the timedOut re-key).
export function matchedSpecificity(sig: Signature, ctx: DetectContext): number {
  if (!evalSignature(sig, ctx)) return Infinity;
  if ("astTag" in sig || "choice" in sig || "recallEquals" in sig) return 0;
  if ("testFailure" in sig || "propertyFailed" in sig) return 1;
  if ("runError" in sig || "timedOut" in sig) return 2;
  if ("any" in sig) {
    return Math.min(...sig.any.map((s) => matchedSpecificity(s, ctx)));
  }
  if ("all" in sig) {
    return sig.all.length ? Math.min(...sig.all.map((s) => matchedSpecificity(s, ctx))) : 3;
  }
  if ("not" in sig) {
    // A matched `not` has no positive leaf (the guard above already proved sig is true, so
    // sig.not is FALSE — recursing would return Infinity). Rank it by the STATIC specificity
    // of what it negates. Do NOT "simplify" this into a recursive matchedSpecificity call.
    return specificityRank(sig.not);
  }
  return 3;
}

// §7 detect — first-match within a skill, global tie-break (specificity, then id).
export function detect(step: Step, ctx: DetectContext, bundle: Bundle): string | null {
  const candidates: string[] = [];
  for (const skillId of step.skills) {
    const skill = bundle.skills[skillId];
    if (!skill) continue;
    for (const mid of skill.misconceptions) {
      const m = bundle.misconceptions[mid];
      if (!m) continue;
      if (evalSignature(m.signature, ctx)) candidates.push(mid);
    }
  }
  if (candidates.length === 0) return null;
  const unique = [...new Set(candidates)];
  unique.sort((a, b) => {
    const sa = bundle.misconceptions[a]!.signature;
    const sb = bundle.misconceptions[b]!.signature;
    const ma = matchedSpecificity(sa, ctx);
    const mb = matchedSpecificity(sb, ctx);
    if (ma !== mb) return ma - mb;
    const ra = specificityRank(sa);
    const rb = specificityRank(sb);
    if (ra !== rb) return ra - rb;
    return a < b ? -1 : a > b ? 1 : 0;
  });
  return unique[0]!;
}
