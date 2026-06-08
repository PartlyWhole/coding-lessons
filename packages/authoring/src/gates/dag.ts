import type { Loaded } from "../raw-types.js";
import { buildProducers } from "../indexes.js";
import type { GateIssue } from "./types.js";

const G = "3-dag";

export function gateDag(loaded: Loaded): GateIssue[] {
  const issues: GateIssue[] = [];
  const err = (message: string) => issues.push({ gate: G, level: "error", message });
  const { nodes, skills } = loaded;
  const producers = buildProducers(loaded);

  // node DAG (validate.py 92-107): edge producer(req.skill) -> node
  const color: Record<string, 0 | 1 | 2> = {};
  for (const nid of Object.keys(nodes)) color[nid] = 0;
  const visit = (nid: string, stack: string[]): void => {
    color[nid] = 1;
    for (const r of nodes[nid]!.requires ?? []) {
      for (const p of producers[r.skill] ?? []) {
        if (p === nid) continue;
        if (color[p] === 1) err(`CYCLE: ${[...stack, nid, p].join(" -> ")}`);
        else if (color[p] === 0) visit(p, [...stack, nid]);
      }
    }
    color[nid] = 2;
  };
  for (const nid of Object.keys(nodes)) if (color[nid] === 0) visit(nid, []);

  // upstream skill DAG (validate.py 109-123)
  const uc: Record<string, 0 | 1 | 2> = {};
  for (const sid of Object.keys(skills)) uc[sid] = 0;
  const uvisit = (sid: string, stack: string[]): void => {
    uc[sid] = 1;
    for (const up of skills[sid]!.upstream ?? []) {
      if (!skills[up]) { err(`${sid}.upstream references undefined skill ${up}`); continue; }
      if (uc[up] === 1) err(`UPSTREAM CYCLE: ${[...stack, sid, up].join(" -> ")}`);
      else if (uc[up] === 0) uvisit(up, [...stack, sid]);
    }
    uc[sid] = 2;
  };
  for (const sid of Object.keys(skills)) if (uc[sid] === 0) uvisit(sid, []);

  // §4.2 spine connectivity (NEW; not in validate.py): every spine node reachable from the
  // single spine root via enable-edges A->B (A teaches a skill B requires).
  const spine = Object.keys(nodes).filter((n) => nodes[n]!.track === "spine");
  if (spine.length > 0) {
    const teaches = (n: string) => new Set(nodes[n]!.teaches ?? []);
    const spineProducerReq = (n: string) =>
      (nodes[n]!.requires ?? []).some((r) => spine.some((p) => p !== n && teaches(p).has(r.skill)));
    const roots = spine.filter((n) => !spineProducerReq(n));
    if (roots.length !== 1) {
      err(`spine must have exactly one root (nodes with no spine prerequisite), found ${roots.length}: ${roots.join(", ")}`);
    }
    const enables = (a: string, b: string) => (nodes[b]!.requires ?? []).some((r) => teaches(a).has(r.skill));
    const seen = new Set<string>(roots);
    const queue = [...roots];
    while (queue.length) {
      const a = queue.shift()!;
      for (const b of Object.keys(nodes)) if (!seen.has(b) && enables(a, b)) { seen.add(b); queue.push(b); }
    }
    for (const n of spine) if (!seen.has(n)) err(`spine node ${n} is not reachable from the spine root (disconnected)`);
  }

  return issues;
}
