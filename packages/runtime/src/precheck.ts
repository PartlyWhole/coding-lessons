import type { AstQuery } from "@trellis/schema";

export const REFUSAL_MESSAGE =
  "This loop never yields to the browser — add `await asyncio.sleep(1/60)` inside it so the page stays responsive.";

// CONSERVATIVE BY DESIGN (pinned by the orchestrator at plan review; ambiguity A3):
// ANY `while` with no Await descendant is refused pre-play — including bounded whiles
// inside helper functions. KNOWN LIMITATION, accepted for M6.5: a legal bounded
// `while` (e.g. inside `update`) gets a false refusal. Rationale: lesson scaffolds use
// `for`; a false refusal is a teachable nudge, a false pass is a frozen tab. Narrowing
// to top-level/`main` loops only would need a within-Module selector the current
// AstQuery cannot express (a schema escalation — explicitly declined for M6.5).
// Attribution flavor is `syntax` (§17.5) — a deterministic rejection.
// The pred-level `not` is a sandbox-interpreter extension (RUNTIME-INTERNAL; the
// frozen schema's AstPred union has no negation, so content can never author this
// query — hence the cast). See packages/sandbox/src/ast-query.ts `pred_ok`.
export const AWAITLESS_LOOP_QUERIES: { tag: string; query: AstQuery }[] = [
  {
    tag: "awaitless_loop",
    query: {
      node: "While",
      where: { not: { childMatches: { node: "Await" } } },
    } as unknown as AstQuery,
  },
];

export type PrecheckResult = { ok: true } | { ok: false; refusal: string };

// parseAndMatch only ast.parses (never executes) and runs OFF the main thread; the
// runtime takes the function — not a whole sandbox — to stay narrow.
export async function precheckSource(
  source: string,
  parseAndMatch: (
    code: string,
    queries: { tag: string; query: AstQuery }[],
  ) => Promise<string[]>,
): Promise<PrecheckResult> {
  const tags = await parseAndMatch(source, AWAITLESS_LOOP_QUERIES);
  return tags.includes("awaitless_loop") ? { ok: false, refusal: REFUSAL_MESSAGE } : { ok: true };
}
