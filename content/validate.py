#!/usr/bin/env python3
"""Cross-bundle P7 validation (TECHNICAL_DESIGN.md §13.2 gates 1-4 + 8-9, bundle scope).
Not the real @trellis/authoring compiler — a pre-flight that catches dangling refs,
granularity, certifies-subset, DAG cycles, the extension single-track rule, and the
gate-8/9 answerability/correct-choice-misconception checks (lockstep with the TS gates)."""
import glob, re, sys, yaml
from collections import defaultdict

nodes, skills, miscons = {}, {}, {}
errs, warns = [], []

for f in sorted(glob.glob("content/nodes/*.yaml")):
    doc = yaml.safe_load(open(f))
    n = doc["node"]; nodes[n["id"]] = n; n["_file"] = f

for f in sorted(glob.glob("content/skills/*.yaml")):
    for doc in yaml.safe_load_all(open(f)):
        if not doc or "skill" not in doc:
            continue
        s = doc["skill"]
        if s["id"] in skills:
            errs.append(f"duplicate skill id {s['id']} ({f} & {skills[s['id']]['_file']})")
        s["_file"] = f; skills[s["id"]] = s
        for m in s.get("misconceptions", []):
            if m["id"] in miscons:
                errs.append(f"duplicate misconception id {m['id']}")
            m["_skill"] = s["id"]; miscons[m["id"]] = m

# producers: skill -> nodes that teach it
producers = defaultdict(list)
for nid, n in nodes.items():
    for sk in n.get("teaches", []):
        producers[sk].append(nid)

# Gate: every taught skill is defined in a taxonomy
for nid, n in nodes.items():
    for sk in n.get("teaches", []):
        if sk not in skills:
            errs.append(f"{nid} teaches undefined skill {sk}")
    for c in n.get("cells", []):
        for sk in c.get("certifies", []):
            if sk not in n.get("teaches", []):
                errs.append(f"{c['id']} certifies {sk} not in {nid}.teaches")
    # every taught skill must actually be certified by some cell (≥1 certifying step)
    certified = {sk for c in n.get("cells", []) for sk in c.get("certifies", [])}
    for sk in n.get("teaches", []):
        if sk not in certified:
            errs.append(f"{nid} teaches {sk} but no cell certifies it")

# Gate 2: referential integrity — every required skill has a producer
for nid, n in nodes.items():
    track_edges = 0
    for r in n.get("requires", []):
        if r["kind"] == "track":
            track_edges += 1
        if not producers.get(r["skill"]):
            errs.append(f"{nid} requires {r['skill']} which NO node teaches (dangling)")
    if n.get("track") == "extension" and track_edges != 1:
        errs.append(f"extension {nid} must have exactly 1 track edge, has {track_edges}")

# misconception.skill resolves; each skill has >=1 misconception (granularity)
for mid, m in miscons.items():
    if m["skill"] not in skills:
        errs.append(f"{mid}.skill {m['skill']} undefined")
mc_count = defaultdict(int)
for mid, m in miscons.items():
    mc_count[m["skill"]] += 1
for sid in skills:
    c = mc_count[sid]
    if c == 0:
        errs.append(f"granularity: skill {sid} has 0 misconceptions (merge or add one)")
    elif c > 6:
        warns.append(f"granularity: skill {sid} has {c} misconceptions (>6, consider split)")

# misconception ids referenced by nodes (choices, maps) must be defined
def walk_steps(n):
    for c in n.get("cells", []):
        for s in c.get("steps", []):
            for ch in s.get("choices", []) or []:
                if ch.get("misconception"):
                    yield ch["misconception"]
            acc = s.get("accepted") or {}
            for mm in (acc.get("misconceptionMap") or {}).values():
                yield mm
            exp = s.get("expected") or {}
            for mm in (exp.get("misconceptionMap") or {}).values():
                yield mm
for nid, n in nodes.items():
    for ref in walk_steps(n):
        if ref not in miscons:
            errs.append(f"{nid} references undefined misconception {ref}")

# Gates 8 + 9 (ported from @trellis/authoring gates/answerable.ts +
# correct-choice-miscon.ts, themselves a faithful mirror of the engine's §8
# non-build matching: normalize = trim/lower/collapse-ws; match = normalized
# exact OR anchored full-match pattern). Golden precedents: 0884bf3 (three
# unanswerable choice-mode predicts), d8f20b3 + aacf0ce (five misconception
# tags on the CORRECT choice).
def _gnorm(s):
    return re.sub(r"\s+", " ", s.strip().lower())

def _matches_accepted(acc, value):
    if any(_gnorm(a) == _gnorm(value) for a in (acc.get("normalized") or [])):
        return True
    for p in (acc.get("patterns") or []):
        try:  # engine uses anchored RE2 full-match; corpus patterns are lint-re2-gated
            if re.fullmatch(p, value):
                return True
        except re.error:
            pass  # non-compiling patterns are lint-re2's finding, non-matching here
    return False

def _gate9_map(step, field, acc):
    for key in (acc.get("misconceptionMap") or {}):
        if _matches_accepted(acc, key):
            errs.append(f"gate9: {step['id']} {field}.misconceptionMap key {key!r} "
                        f"matches the accepted answers — it tags a CORRECT answer and can never fire")

for nid, n in nodes.items():
    for c in n.get("cells", []):
        for s in c.get("steps", []):
            kind, choices = s.get("kind"), s.get("choices") or []
            if kind == "predict":
                exp = s.get("expected") or {}
                if choices:
                    # Gate 8: the engine compares the chosen CHOICE ID against expected —
                    # some choice id must match, or no learner can ever pass the step.
                    if not any(_matches_accepted(exp, ch["id"]) for ch in choices):
                        errs.append(f"gate8: {s['id']} unanswerable choice-mode predict — no choice id "
                                    f"matches expected (ids: {', '.join(ch['id'] for ch in choices)})")
                    # Gate 9: a misconception tag describes the belief that picks a WRONG choice.
                    for ch in choices:
                        if ch.get("misconception") and _matches_accepted(exp, ch["id"]):
                            errs.append(f"gate9: {s['id']} misconception {ch['misconception']} on the "
                                        f"CORRECT choice {ch['id']!r} (its id matches expected)")
                _gate9_map(s, "expected", exp)
            elif kind == "recognize":
                for ch in choices:
                    if ch.get("misconception") and ch["id"] == s.get("correctChoiceId"):
                        errs.append(f"gate9: {s['id']} misconception {ch['misconception']} on the "
                                    f"CORRECT choice {ch['id']!r} (correctChoiceId)")
            elif kind == "recall":
                _gate9_map(s, "accepted", s.get("accepted") or {})

# Gate 3: DAG over induced node graph (producer(req.skill) -> node)
color = {nid: 0 for nid in nodes}  # 0 white 1 gray 2 black
def visit(nid, stack):
    color[nid] = 1
    for r in nodes[nid].get("requires", []):
        for p in producers.get(r["skill"], []):
            if p == nid:
                continue
            if color[p] == 1:
                errs.append(f"CYCLE: {' -> '.join(stack+[nid,p])}")
            elif color[p] == 0:
                visit(p, stack + [nid])
    color[nid] = 2
for nid in nodes:
    if color[nid] == 0:
        visit(nid, [])

# Gate 3b: Skill.upstream graph must also be acyclic (§4.2, validated independently)
ucolor = {sid: 0 for sid in skills}
def uvisit(sid, stack):
    ucolor[sid] = 1
    for up in skills[sid].get("upstream", []):
        if up not in skills:
            errs.append(f"{sid}.upstream references undefined skill {up}"); continue
        if ucolor[up] == 1:
            errs.append(f"UPSTREAM CYCLE: {' -> '.join(stack+[sid,up])}")
        elif ucolor[up] == 0:
            uvisit(up, stack + [sid])
    ucolor[sid] = 2
for sid in skills:
    if ucolor[sid] == 0:
        uvisit(sid, [])

print(f"nodes={len(nodes)} skills={len(skills)} misconceptions={len(miscons)}")
for w in warns: print("WARN:", w)
for e in errs: print("ERROR:", e)
print("\nRESULT:", "PASS" if not errs else f"FAIL ({len(errs)} errors)")
sys.exit(1 if errs else 0)
