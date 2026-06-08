#!/usr/bin/env python3
"""Cross-bundle P7 validation (TECHNICAL_DESIGN.md §13.2 gates 1-4, bundle scope).
Not the real @trellis/authoring compiler — a pre-flight that catches dangling refs,
granularity, certifies-subset, DAG cycles, and the extension single-track rule."""
import glob, sys, yaml
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

print(f"nodes={len(nodes)} skills={len(skills)} misconceptions={len(miscons)}")
for w in warns: print("WARN:", w)
for e in errs: print("ERROR:", e)
print("\nRESULT:", "PASS" if not errs else f"FAIL ({len(errs)} errors)")
sys.exit(1 if errs else 0)
