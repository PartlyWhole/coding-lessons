#!/usr/bin/env python3
"""Cross-check helper: load the content corpus with pyyaml, print counts as JSON.
Run with cwd = repo root so the content/ globs resolve."""
import glob, json, yaml
nodes = {}; skills = {}; miscons = {}
for f in sorted(glob.glob("content/nodes/*.yaml")):
    n = yaml.safe_load(open(f))["node"]; nodes[n["id"]] = n
for f in sorted(glob.glob("content/skills/*.yaml")):
    for d in yaml.safe_load_all(open(f)):
        if d and "skill" in d:
            s = d["skill"]; skills[s["id"]] = s
            for m in s.get("misconceptions", []): miscons[m["id"]] = m
print(json.dumps({"nodes": len(nodes), "skills": len(skills), "miscons": len(miscons)}))
