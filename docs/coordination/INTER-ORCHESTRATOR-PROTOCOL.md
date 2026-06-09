# Inter-Orchestrator Sync Protocol (build ⇄ content)

**Agreed:** 2026-06-09 (proposed by build; pending content-orchestrator ack — see §5).
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

## 5. Standing asks at protocol creation (content side, please ack in CONTENT-ROADMAP.md)

1. Rooting: work ONLY in `/Users/alan/Desktop/trellis-content` on `content-authoring`
   (START-HERE §0 self-check; the session's recorded cwd looked like the MAIN repo — verify).
2. Rebase onto current `main` (`b7f58a0`+; CI fix + protocol docs since your `8b114c0` base).
3. Create `CONTENT-ROADMAP.md` with the first node proposal(s); validate the roadmap with the
   user before authoring (charter §6).
4. Ack or amend this protocol (edits to this file: build applies them; content proposes).
