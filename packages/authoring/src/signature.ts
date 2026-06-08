// Ports content/verify/harness.py sig_match/norm/sig_kinds/sig_tags (lines 151-168, 239-259),
// plus the frozen {timedOut:true} Signature primitive (supported, unused by the corpus).
export interface Signals {
  astTags?: Set<string>;
  ran?: boolean;
  runError?: { type: "syntax" | "runtime" } | null;
  timedOut?: boolean;
  tests?: { failed: number; failures: number[] } | null;
  propertyFailed?: boolean;
  chosenChoiceId?: string;
  recallInput?: string;
}

type Sig = Record<string, unknown>;

export function norm(s: string): string {
  const collapsed = String(s).trim().split(/\s+/).filter((x) => x.length > 0).join(" ").toLowerCase();
  return collapsed.endsWith(".") ? collapsed.slice(0, -1) : collapsed;
}

export function sigMatch(sig: Sig, signals: Signals): boolean {
  if ("all" in sig) return (sig["all"] as Sig[]).every((s) => sigMatch(s, signals));
  if ("any" in sig) return (sig["any"] as Sig[]).some((s) => sigMatch(s, signals));
  if ("not" in sig) return !sigMatch(sig["not"] as Sig, signals);
  if ("astTag" in sig) return (signals.astTags ?? new Set()).has(sig["astTag"] as string);
  if ("runError" in sig) {
    const re = signals.runError;
    return !!re && re.type === (sig["runError"] as string);
  }
  if ("timedOut" in sig) return signals.timedOut === true; // frozen Signature primitive (new)
  if ("testFailure" in sig) {
    const t = signals.tests;
    if (!t || t.failed === 0) return false;
    const tf = sig["testFailure"] as { caseIndex?: number };
    if ("caseIndex" in tf) return t.failures.includes(tf.caseIndex!);
    return true;
  }
  if ("propertyFailed" in sig) return signals.propertyFailed === true;
  if ("choice" in sig) return signals.chosenChoiceId === (sig["choice"] as string);
  if ("recallEquals" in sig) return norm(signals.recallInput ?? "\0") === norm(sig["recallEquals"] as string);
  return false;
}

const KIND_KEYS = ["astTag", "runError", "timedOut", "testFailure", "propertyFailed", "choice", "recallEquals"] as const;

export function sigKinds(sig: Sig, acc = new Set<string>()): Set<string> {
  for (const k of ["all", "any"] as const) if (k in sig) for (const s of sig[k] as Sig[]) sigKinds(s, acc);
  if ("not" in sig) sigKinds(sig["not"] as Sig, acc);
  for (const k of KIND_KEYS) if (k in sig) acc.add(k);
  return acc;
}

export function sigTags(sig: Sig, acc = new Set<string>()): Set<string> {
  for (const k of ["all", "any"] as const) if (k in sig) for (const s of sig[k] as Sig[]) sigTags(s, acc);
  if ("not" in sig) sigTags(sig["not"] as Sig, acc);
  if ("astTag" in sig) acc.add(sig["astTag"] as string);
  return acc;
}
