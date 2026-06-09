# Stream A / M1 (`@trellis/authoring`) — Report to Orchestrator

**From:** Stream A (M1 `@trellis/authoring`) · **Branch:** `m1-authoring` · **Updated:** 2026-06-08 (post-rebase)
**Rebased onto:** `main` @ `c129d4d`

## ✅ STATUS: GREEN — ready for integration

Both previously-escalated items are resolved on `main` and rebased in; the branch is fully green.

| Check | Result |
|---|---|
| `pnpm --filter @trellis/authoring typecheck` | clean |
| `pnpm --filter @trellis/authoring lint` | clean |
| `pnpm --filter @trellis/authoring test` | **76/76 passed (23 files)** |
| `pnpm -w build` | all 4 packages build |
| `node ./packages/authoring/dist/src/cli.js lint` | `RESULT: PASS` (exit 0) |
| `node ./packages/authoring/dist/src/cli.js build` | wrote bundle `ca-4bad1bc75a1c9255`, exit 0 |
| `python3 content/validate.py` | `RESULT: PASS` |
| `python3 content/verify/harness.py` | `gate5: PASS \| gate6 oracle-smoke: PASS` |
| TS-matcher ↔ `harness.py` differential (incl. new `field` forms) | **agree on all 21 fixtures** |

## Resolution of the two escalated items

- **Item 1 — `GenSpec.elem.param` (BLOCKER):** RESOLVED on `main` via the paramless `ElemSpec` split
  (`fec6b8f`, decision A — top-level `GenSpec.param` kept required). `Value.Check(Bundle)` now passes
  with zero errors. The four pinned tests (`compile`/`gates-run`/`cli`/`corpus.smoke`) were flipped
  from "exactly one gate-1 error" to full validity. Confirmed my code reads no `elem.param`.
- **Item 2 — packaging:** RESOLVED on `main` via the dist `exports` + `development`→src condition
  (`f9bcef6`). The built CLI's `@trellis/schema` value-import now resolves under plain `node`; the
  full built `dist/src/index.js` native-ESM-imports, and `node ./dist/src/cli.js` runs.

## §6.3 rule-1 cross-check (per orchestrator heads-up `3a8bf73`)

`main` migrated the two over-matching AST queries to the `field` selector
(`has_elif → {node:If, field:{orelse:{node:If}}}`, `infinite_true_no_break → {node:While,
field:{test:{node:Constant, …eq:true}}, …}`) and taught `harness.py` to implement `field`. After
rebase, the differential test (`gate-fixtures.differential.test.ts`) and my `matcher-field.test.ts`
both pass: **my TS matcher and the harness agree on `field` semantics across all 21 fixtures.** No
§6.3 ambiguity surfaced.

## What M1 delivers (unchanged)

YAML → `Bundle` transform (extract/strip/inject-`nodeId`/id-lists, §4.1 derived indexes,
content-addressed version); the seven §13.2 gates (1–6 ported + cross-checked vs `harness.py` on all
21 fixtures; 7 = M4 plug-in stub); the §6.3 loud-reject + spine-never-requires-extension + RE2 lints;
`trellis lint | build | grade` CLI. The compiler **supports** the `field` selector and `{timedOut:true}`
Signature primitive (the latter's corpus re-key is scheduled as an M4 action item per `c129d4d`).

Branch kept as-is otherwise — the merge to `main` is the orchestrator's.
