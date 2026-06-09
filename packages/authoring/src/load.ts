import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { load as yamlLoad, loadAll as yamlLoadAll } from "js-yaml";
import type { Loaded, RawNode, RawSkill } from "./raw-types.js";

function listYaml(dir: string): string[] {
  return readdirSync(dir)
    .filter((f) => f.endsWith(".yaml"))
    .sort()
    .map((f) => join(dir, f));
}

/** Load `<root>/nodes/*.yaml` (single-doc) and `<root>/skills/*.yaml` (multi-doc). */
export function loadContent(contentRoot: string): Loaded {
  const nodes: Record<string, RawNode> = {};
  const skills: Record<string, RawSkill> = {};
  const miscons: Loaded["miscons"] = {};

  for (const file of listYaml(join(contentRoot, "nodes"))) {
    const doc = yamlLoad(readFileSync(file, "utf8")) as { node?: RawNode } | null;
    if (!doc || !doc.node) continue;
    const n = doc.node;
    n._file = file;
    nodes[n.id] = n;
  }

  for (const file of listYaml(join(contentRoot, "skills"))) {
    for (const raw of yamlLoadAll(readFileSync(file, "utf8"))) {
      const doc = raw as { skill?: RawSkill } | null;
      if (!doc || !doc.skill) continue;
      const s = doc.skill;
      s._file = file;
      const existing = skills[s.id];
      if (existing) {
        throw new Error(`duplicate skill id ${s.id} (${file} & ${existing._file})`);
      }
      skills[s.id] = s;
      for (const m of s.misconceptions ?? []) {
        if (miscons[m.id]) throw new Error(`duplicate misconception id ${m.id}`);
        m._skill = s.id;
        miscons[m.id] = m;
      }
    }
  }

  return { nodes, skills, miscons };
}
