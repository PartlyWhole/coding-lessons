import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

type Any = any; // intentional: fixtures work with raw YAML content of unknown shape

export interface RawContent {
  nodes: Record<string, Any>;
  skills: Record<string, Any>;
  miscons: Record<string, Any>; // misconception + _skill back-ref, mirroring harness.py
}

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "../../.."); // packages/sandbox/test -> repo root

const LOADER = `
import glob, json, yaml
nodes, skills, miscons = {}, {}, {}
for f in sorted(glob.glob("content/nodes/*.yaml")):
    n = yaml.safe_load(open(f))["node"]; nodes[n["id"]] = n
for f in sorted(glob.glob("content/skills/*.yaml")):
    for d in yaml.safe_load_all(open(f)):
        if d and "skill" in d:
            s = d["skill"]; skills[s["id"]] = s
            for m in s.get("misconceptions", []):
                m["_skill"] = s["id"]; miscons[m["id"]] = m
print(json.dumps({"nodes": nodes, "skills": skills, "miscons": miscons}))
`;

export function loadRawContent(python = "python3"): RawContent {
  const proc = spawnSync(python, ["-c", LOADER], { cwd: REPO, encoding: "utf-8", maxBuffer: 32 * 1024 * 1024 });
  if (proc.status !== 0) throw new Error(`fixture load failed: ${proc.stderr}`);
  return JSON.parse(proc.stdout) as RawContent;
}

// AST tags a signature references (mirrors harness.py sig_tags).
export function sigTags(sig: Any, acc = new Set<string>()): Set<string> {
  for (const k of ["all", "any"]) if (sig[k]) for (const s of sig[k]) sigTags(s, acc);
  if (sig.not) sigTags(sig.not, acc);
  if (sig.astTag) acc.add(sig.astTag);
  return acc;
}

// The build step that surfaces a misconception — harness.py pick_step: the owner node's
// build step whose AST tags superset the needed tags; else the first build step certifying
// the skill.
export function pickBuildStep(content: RawContent, mis: Any): Any | null {
  const skillId = mis._skill as string;
  const ownerNode = Object.values(content.nodes).find((n: Any) => (n.teaches ?? []).includes(skillId));
  const cands: Any[] = [];
  const collect = (node: Any): void => {
    for (const c of node?.cells ?? []) {
      const touch = new Set<string>(c.certifies ?? []);
      for (const st of c.steps ?? []) {
        if (st.kind === "build" && (new Set<string>(st.skills ?? []).has(skillId) || touch.has(skillId))) cands.push(st);
      }
    }
  };
  if (ownerNode) collect(ownerNode);
  if (cands.length === 0) for (const n of Object.values(content.nodes)) collect(n);
  const needed = sigTags(mis.signature);
  if (needed.size > 0) {
    for (const st of cands) {
      const tags = new Set<string>((st.evaluator?.ast?.queries ?? []).map((q: Any) => q.tag));
      if ([...needed].every((t) => tags.has(t))) return st;
    }
  }
  return cands[0] ?? null;
}
