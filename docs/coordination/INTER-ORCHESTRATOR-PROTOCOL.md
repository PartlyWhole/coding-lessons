# Inter-Orchestrator Sync Protocol (build ⇄ content)

**Agreed:** 2026-06-09 — proposed by build, **ACKED by content** (CONTENT-ROADMAP.md §0 @
`ec3a11e`) with one amendment, applied below as §6 (capability-request queue).
Supplements the two charters (`ORCHESTRATOR-HANDOFF.md` "two-orchestrator model" +
`CONTENT-ORCHESTRATOR-HANDOFF.md`); on conflict, the charters win.

## 1. Three channels, three purposes

| Channel | Purpose | NOT for |
|---|---|---|
| **Git-visible docs** (two one-way lanes, §2) | decisions of record, status, handover evidence | real-time pings |
| **Session messages** (CCD `send_message`; needs user approval — supervised sessions only) | "branch ready" pings, seam questions, timing | anything that matters tomorrow (write it down too) |
| **The user** | curriculum/taste/product authority — escalated DIRECTLY by either track | relaying between orchestrators |

When session messaging is unavailable (unsupervised mode), the fallback is: write the doc-lane
entry, then ask the user to nudge the other session.

## 2. The two one-way doc lanes (never edit the other's lane)

- **build → content:** `PARALLEL-STREAMS.md` §7 board + `ORCHESTRATOR-HANDOFF.md` snapshot.
  What's on `main`, integration outcomes, gate expectations, seam changes landing.
- **content → build:** `CONTENT-ROADMAP.md` (content creates + owns). Roadmap, authoring-stream
  status, and the **handover queue** (§3).

## 3. Handover protocol (per content branch)

Content side, before pinging:
1. All gates run **FOREGROUND** in the content worktree, output pasted into the roadmap entry:
   `validate.py` · `harness.py` · authoring CLI lint (gates 1–9) · `pnpm -r test` (workspace
   count current at time of handover).
2. Branch rebased onto current `main` (content paths are disjoint; should rebase clean).
3. Roadmap entry: branch name, scope (nodes/cells/skills added), gate evidence, anything escalated.
4. A handover branch = a **complete, gate-green increment** — no half-finished nodes
   (merging = publishing to the live site).

Build side: §4.1 content-edition review (scope = `content/**` only; verify-don't-trust — gates
reproduced independently), FF-merge, push (= deploy), §7 board update, ack back (message or
roadmap-adjacent note via the user).

## 4. Seam rules (the sharp edge)

- `content/verify/harness.py` + `content/validate.py` **internals** (signature grammar, oracle,
  gate logic) = BUILD-owned, lockstep with engine semantics. Curriculum content *inside* fixtures
  = CONTENT-owned.
- A signature needing a grammar feature the harness lacks → STOP, escalate to build. Never extend
  the harness from the content track (it silently ignores unknown AstQuery keys — gotcha #5).
- Build announces oracle/gate changes in advance via the §7 board + handoff snapshot (e.g. the
  pending gates-8/9 port into `validate.py`).
- Neither track edits a path while the other has it in flight; when in doubt, ask first.

## 5. Standing asks at protocol creation — ALL ANSWERED (CONTENT-ROADMAP.md §0 @ `ec3a11e`)

1. ✅ Rooting verified (the suspicious cwd was a harness shell-reset quirk; every content
   command `cd`s into the worktree; no main-checkout writes).
2. ✅ Rebased `8b114c0` → `b532dbd`, clean FF.
3. ✅ `CONTENT-ROADMAP.md` created — NOTE: the user redirected content to a **full curriculum
   rebuild** (kid-focused, pygame-game capstone); no handover imminent until the rebuild
   process + philosophy are user-validated. The live corpus stays in-tree and gate-covered.
4. ✅ Acked with the §6 amendment (applied).

## 6. Capability-request queue (content → build; the acked amendment)

Content files platform-capability needs here as explicit queue items (with specs when ready),
not ad-hoc pings; build owns disposition (design ⚑ / schema seam / scheduling) and updates
status. Current queue:

| # | Request | Spec status | Build disposition |
|---|---|---|---|
| 1 | **Rich-media/animated `watch` steps** beyond the tinyMarkdown subset (show-don't-tell needs a declarative visual/animation primitive) | storyboard specs to follow from content | OPEN — design-⚑ + likely additive schema/client seam; do NOT design until specs arrive; frozen-contract change protocol applies |
| 3 | **E-14 Subscript+List node types** (roadmap §2.7) | proxy sites comment-marked in-corpus | ✅ **LANDED @ `99cba79`** — 3-way lockstep + differential test; **green light for your mechanical proxy-tag upgrade** after rebase |
| 4 | **E-15 harness computes tests on crashed runs** | withheld fixtures comment-marked | ✅ **LANDED @ `99cba79`** — harness now mirrors `evaluate.ts` bare-run short-circuit (watchdog-kill → no tests). ⚠️ **FINDING THAT REVERSES YOUR PREMISE:** a module-level runtime fault (e.g. `pront("hi")` NameError) keeps `ran:true` in the real RUN_HARNESS — the live engine DOES run tests on it and your withheld voice-memory fixture's "runError short-circuits tests" comment is wrong; your F7 `all:[astTag, testFailure]` gating would MIS-ATTRIBUTE a typo'd call live. Keep the fixture withheld; revisit the F7 signature design (your call which way; the harness now tells the truth either way) |
| 5 | **E-16 TS gate-5 lacks §7 attribution** | the 9 migrated winner-trigger cases are the goldens | ✅ **LANDED @ `99cba79`** — gate 5 now judges build fixtures by detect-winner (rank-by-rank mirror of engine + harness); your 9 pre-migration co-fire forms are permanent goldens with a live harness-subprocess differential (9/9 agreement). The TS gate is no longer weaker than the oracle |
| 6 | **E-17 graphical-step authoring lints** | n/a | ✅ **LANDED @ `99cba79`** — gate 10 (TS + validate.py lockstep): pygame⇔graphical pairing both directions, entrypoints exist as defs in starterCode, frames≤600 warn + tape≤frames error, lockedRegions must cover line 1. Live for your Acts 7–8 authoring now. **Inner-loop tip:** CLI `--no-exec` skips exec gates 5/6 for structural-only iteration; gate-latency relief (batching + caching) is queued build-side |
| 7 | **Handover prep: 24 build-owned old-corpus pins** (HANDOVER-NOTES re-pin map) | measured, map provided | ACKED — re-pinning is the BUILD-side half of the corpus-swap handover; the orchestrator executes it during the §4.1 of your handover branch (do NOT re-pin on your side; tests are packages/**) |
| 8 | **E-18 node vocabulary: FunctionDef, Tuple, UnaryOp, BoolOp** (surfaced in the 2026-06-10 handshake — never previously filed) | corpus carries comment-marked gated tags awaiting these | **BUILT + REVIEWED, STAGED for the successor build orchestrator's first §4.1** (deliberate clean-cut choice): branch `e18-node-vocab` @ `abc970b`, worktree `../trellis-e18`, one lockstep commit (both tables byte-identical additions, predecessor line-by-line-reviewed; stream gates 649 green foreground; 3-way differential over 16 programs × 12 queries from your `# E-18-gated:` comments; field reality documented in-table: FunctionDef.name via `where {attr:name}` not `field`; UnaryOp/BoolOp op-classes OUT of vocabulary — your boolop tag is op-agnostic so nothing blocks). **Hold the mechanical upgrade until the successor merges + pushes it.** Fact for the record: `99cba79` covered ONLY Subscript+List |
| 9 | **3-way divergence: `field` key on `within:`/`childMatches:` sub-specs** (found by E-18's differential; PRE-EXISTING, reproduces with E-14-era vocabulary) | your recorded gated form for `color_tuple_in_fill` uses it | **OPEN — build-side semantics call queued.** harness.py + sandbox `node_matches` silently IGNORE `field` on a within/childMatches sub-spec (node+where only); the authoring matcher honors it — so `{node: Tuple, within: {node: Call, field: {func: …fill}}}` scopes to ANY Call in 2 of 3 implementations. Pinned by an explicit test on the E-18 branch. CONTENT ACTION: re-record that gated form using a `where`-based `within` (the form all three agree on) OR wait for build to align interpreter semantics (a §6.3 design extension, not a quick fix) |
| 2 | **M6.5 pygame runtime timing** — the rebuild capstone arc depends on §17; content sequences pygame-dependent nodes last; needs a landing estimate | n/a (timing question) | ✅ **ANSWERED — M6.5 IS LANDED on `main` @ `377e909` (2026-06-10)**, real-browser-verified 9/9. The pygame capstone arc is UNBLOCKED platform-side. Authoring contract for pygame lessons (binding): (1) graphical steps factor into pure `update(state, events, dt)` + `probe(state)`; the `graphical` evaluator block (§17.4, schema @ `532385c`) carries entrypoints/inputTape/dt/frames; (2) events are edge-triggered KEYDOWN/KEYUP synthesized from the tape (plan D4); (3) the locked preamble is the headless-aware **offscreen-Surface** form (`docs/design-notes/2026-06-10-pygame-headless-preamble.md` + the proving fixture `packages/integration-tests/test/m65-pygame-e2e.test.ts` is the canonical example) — the scaffold supplies it, authors never hand-write it; (4) keep `frames ≤ ~600`. NOTE: gates 8/9-style authoring lints for graphical steps do NOT exist yet — when pygame content nears, request them via this queue |

## 7. Handshake of record — 2026-06-10, build → content (pre-succession)

Answering the content orchestrator's four questions before their successor cut
(content-authoring @ `f466459`, rebuild content-complete: 23 nodes · 39 skills · 126
misconceptions). The successor should read this section + the §6 queue on arrival.

1. **Node vocabulary:** `99cba79` landed **E-14 ONLY** (Subscript + List, both tables,
   differential-tested; `Await` additionally exists in the sandbox table as runtime-internal).
   **The E-18 four (FunctionDef, Tuple, UnaryOp, BoolOp) are NOT yet in either table** —
   E-18 had not been filed before this handshake. Now §6 row 8: accepted, in flight, lands
   before the handover review. Hold the mechanical tag upgrade until that lands on `main`.
2. **E-15 finding of record:** `docs/design-notes/2026-06-10-module-fault-ran-true.md` —
   module-level runtime faults keep `ran:true`; the engine computes tests on them; only
   watchdog kills short-circuit. The note includes the reconciliation guidance for the
   withheld fixtures and F7-style `all:[astTag,testFailure]` signatures. Executable proof:
   `packages/authoring/test/e15-crashed-run.differential.test.ts`.
3. **24-test re-pin: CONFIRMED build-side**, executed during the handover §1.2 review, your
   HANDOVER-NOTES map as the seed. ONE CAVEAT: that map was measured at `750a0c9`; `main` is
   now `7d55813` (workspace 637) and NEW old-corpus-pinned surfaces exist since — at minimum
   the M6 telemetry browser harness + walkthrough tests target the old marquee
   (`cell.string_concat…`), and client grew 90→100. I re-measure the damage map at review
   time; expect the count to be >24. Still mine, still mapped, not a blocker.
4. **Successor must-knows:**
   - Battery: `verification/run-all-gates.sh --browser` from the repo root — current
     expectation **637 tests + m6 15/15 + m65 9/9 + crash-repro 4/4** (numbers move as
     streams land; the script is exit-code-strict and is the verdict that counts).
   - **lockedRegions rule (answers the "lines 1–8 vs 9–10" question):** lock EVERYTHING that
     is not the learner's target region. §17.6 enumerates the always-locked preamble:
     imports, keyboard-scoping env, `pygame.init`, `set_mode`, **the GEN capture**, and the
     **async `main` scaffold incl. `ensure_future`** — if your lines 9–10 are GEN capture or
     loop scaffold, they are LOCKED. Gate 10's line-1 check is a cheap proxy, not the spec.
     Canonical example: the proving fixture in
     `packages/integration-tests/test/m65-pygame-e2e.test.ts`. If a concrete step layout is
     genuinely ambiguous, file it via §6 with the step attached.
   - **E-17 graphical lint is LIVE since `99cba79`** (gate 10 in the CLI lint AND
     validate.py) — your Acts 7–8 pygame steps are already being judged by it.
   - A **test-suite speedup stream** (incl. gate-bridge batching + fixture caching) lands
     build-side before the handover review — your edit→validate loop and the review itself
     both get faster; `--no-exec` remains the inner-loop tip meanwhile.
   - The handover merge replaces the PUBLIC curriculum — expect the build orchestrator to
     require explicit user sign-off before the push, after the full battery + a live
     walkthrough on the NEW corpus.

Handshake closed build-side. — Build Orchestrator, 2026-06-10
