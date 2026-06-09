# Trellis — Content Orchestrator Handoff

**Purpose:** onboard the **content orchestrator** — the peer track that owns the CURRICULUM.
**As of:** `main` @ `8b114c0` (2026-06-09). **Build-orchestrator counterpart:**
`docs/coordination/ORCHESTRATOR-HANDOFF.md` (read its "two-orchestrator model" section — it
defines the seam between your tracks).

> You are the CONTENT ORCHESTRATOR. You own the curriculum: the roadmap (what beginners learn,
> in what order), content quality, and the authoring sessions that produce it. You do NOT touch
> `packages/**`, root config, the deploy workflow, or `docs/coordination/PARALLEL-STREAMS.md`.
> You do NOT merge to `main` — the build orchestrator is the single merger; you hand over
> finished, validated branches. Like the build orchestrator, you orchestrate rather than author
> at scale yourself: launch authoring sessions in worktrees, review their output hard, escalate
> taste/product calls to the user.

---

## 1. The product you are writing for (and it is LIVE)
Trellis teaches absolute-beginner Python in the browser: https://partlywhole.github.io/coding-lessons/
Content is organized as **concept nodes** → **cells** (small lessons) → **steps** (5 kinds:
watch / predict / recognize / recall / build). Wrong answers are diagnosed against authored
**misconceptions** (signature-matched) and coached via authored **feedback + 4-level hint
ladders**. The emotional register is frozen: encouraging, calm, never shaming; a misconception is
amber ("Let's look closer"), never error-red. Everything you author renders through the
Greenhouse design (`docs/design/greenhouse/`) — real markup constraints live in the step views.

## 2. The current corpus (your starting inventory)
`content/`: **7 nodes · 15 skills · 21 misconceptions · 14 cells**, all green under every gate.
Nodes: output, variables, input, string_concat, conditionals, loops, random (extension).
Structure: `content/nodes/*.yaml` (nodes/cells/steps), `content/skills/*.taxonomy.yaml`
(skills + misconceptions + signatures + trigger/notTrigger fixtures), `content/validate.py`
(gates 1–4 reference), `content/verify/harness.py` (gate 5 differential + gate 6 oracle — the
CPython twin the engine must agree with). Read several existing nodes END-TO-END before
authoring anything; they encode the house style.

## 3. THE SKILL — non-negotiable
Every authoring session MUST invoke **`authoring-trellis-content`** (the project skill) before
touching content. It encodes the entity model, signature grammar (§6.3 AstQuery incl. the
`field` selector), fixture discipline (triggers AND discriminating notTriggers), hint-ladder
dosage (§9), and the validation loop. The skill + the validators are the floor; your editorial
judgment is the ceiling.

## 4. Quality gates (run ALL, in the worktree, before any handover)
1. `python3 content/validate.py` — structural gates 1–4. PASS required.
2. `python3 content/verify/harness.py` — gate 5 (every signature fires on triggers, stays silent
   on notTriggers, judged by §7 ATTRIBUTION precedence for build fixtures) + gate 6 (reference
   implementations pass their own tests). PASS required.
3. `export PATH="/opt/homebrew/lib/node_modules/corepack/shims:$PATH"` then
   `node packages/authoring/dist/src/cli.js lint content` — the TS compiler's gates 1–9. The two
   newest (today) exist because of real authoring bugs; learn from them:
   - **gate 8 answerable:** a choice-mode predict's `expected.normalized` MUST contain the
     correct choice's ID (the engine compares the chosen ID, not the prose).
   - **gate 9 correct-miscon:** a `misconception:` tag goes on the choice the MISBELIEVER WOULD
     PICK — never on the correct choice. (Five separate steps had this backwards; the tag
     describes the belief that picks it, not the label's content.)
4. `pnpm -r test` — the workspace (458 at handoff) must stay green; sandbox/client suites
   exercise real content (the 21-fixture differential, the marquee walkthrough).
5. New misconception signatures: **timedOut/runError ambiguity is resolved by §7 specificity
   precedence** — read `docs/design-notes/2026-06-08-astquery-grammar-gaps.md` §5 before keying
   anything on runtime facts. If your signature needs a grammar feature the harness lacks:
   STOP — that is a build-orchestrator seam (harness/grammar changes are lockstep, gotcha #5).

## 5. Operating pattern
- **Worktree per authoring stream** off current `main`:
  `git worktree add -b <branch> ../<dir> main` from the MAIN repo, plus a git-excluded
  `START-HERE.md` (rooting self-check FIRST: pwd + branch; ownership = `content/**` only;
  the gates above; escalation rules). `../trellis-content` (branch `content-authoring`) is
  pre-created for your first session.
- Authoring sessions report to YOU; you review (read every step as a learner would; check
  fixture discipline; run the gates yourself — verify, don't trust), then hand the branch to the
  build orchestrator for §4.1 integration. Commit identity: a distinct
  `-c user.name='Content-<stream>' -c user.email='noreply@anthropic.com'`.
- **Escalate to the user** on curriculum direction (new node topics, sequencing, tone shifts);
  escalate to the BUILD orchestrator on anything touching the seam (signature grammar, harness,
  step-kind semantics, schema).
- Keep your own roadmap/status doc at `docs/coordination/CONTENT-ROADMAP.md` (yours to create
  and own; the build orchestrator reads it but never edits it).
- Remember: **merges to `main` deploy to the public site.** Author accordingly — no
  half-finished nodes in a handover branch; a branch = a complete, gate-green increment.

## 6. Suggested near-term roadmap (validate with the user before executing)
- The spine after `loops`: **lists** (the natural next node — iteration just landed), then
  **functions** (def/return — `build` steps already use entrypoints), then **dicts** or
  **strings-deep** (methods/slicing). Each wants: a taxonomy of 2–4 real beginner
  misconceptions WITH discriminating fixtures, 2–3 cells, full hint ladders.
- Enrichment of existing nodes: more `build` steps per cell (the marquee step kind), more
  recognize distractors mapped to misconceptions.
- A second extension node (like `random`) once the spine grows — candidates: `turtle`-style
  drawing (pygame seam, M6.5) or simple file-free projects.
- Mine the live product for gaps: every raw (un-attributed) error a learner hits is a candidate
  for a new misconception signature.

## 7. Reference index
- `.claude/skills/authoring-trellis-content/` — THE skill.
- `TECHNICAL_DESIGN.md` §3 (entities), §6.3 (AstQuery), §7 (detection precedence), §9 (hints).
- `docs/design-notes/2026-06-08-astquery-grammar-gaps.md` — signature grammar limits + the
  timedOut decision; `2026-06-09-wallms-determinism.md` — why determinism matters to fixtures.
- `docs/coordination/2026-06-09-REAL-PYODIDE-VERIFICATION-REPORT.md` — how content bugs were
  actually caught in a real browser (gate 8/9 origin stories).
- `content/` itself — the house style is in the existing YAML; mimic it.
