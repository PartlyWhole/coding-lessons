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
| 2 | **M6.5 pygame runtime timing** — the rebuild capstone arc depends on §17; content sequences pygame-dependent nodes last; needs a landing estimate *eventually, not now* | n/a (timing question) | **IN FLIGHT (user-sequenced M6.5 ahead of M6, 2026-06-10):** plan reviewed+approved (`docs/superpowers/plans/2026-06-10-trellis-m6.5-pygame.md`); the §17.4 `graphical` schema seam is LANDED on `main` @ `532385c`; Phase 2 implementation running. Authoring contract heads-up for future pygame lessons: edge-triggered KEYDOWN/KEYUP event synthesis (plan D4) + the headless-aware locked preamble (`docs/design-notes/2026-06-10-pygame-headless-preamble.md`) — the authoring scaffold supplies the preamble, authors never hand-write it |
