import type { Loaded } from "../raw-types.js";
import { buildProducers } from "../indexes.js";
import type { GateIssue } from "./types.js";

const G = "2-referential";

export function gateReferential(loaded: Loaded): GateIssue[] {
  const issues: GateIssue[] = [];
  const err = (message: string) => issues.push({ gate: G, level: "error", message });
  const producers = buildProducers(loaded);
  const { nodes, skills, miscons } = loaded;

  for (const [nid, n] of Object.entries(nodes)) {
    for (const sk of n.teaches ?? []) if (!skills[sk]) err(`${nid} teaches undefined skill ${sk}`);
    for (const c of n.cells) {
      for (const sk of c.certifies ?? []) {
        if (!(n.teaches ?? []).includes(sk)) err(`${c.id} certifies ${sk} not in ${nid}.teaches`);
      }
    }
    const certified = new Set(n.cells.flatMap((c) => c.certifies ?? []));
    for (const sk of n.teaches ?? []) if (!certified.has(sk)) err(`${nid} teaches ${sk} but no cell certifies it`);
  }

  for (const [nid, n] of Object.entries(nodes)) {
    let trackEdges = 0;
    for (const r of n.requires ?? []) {
      if (r.kind === "track") trackEdges++;
      if (!producers[r.skill]?.length) err(`${nid} requires ${r.skill} which NO node teaches (dangling)`);
    }
    if (n.track === "extension" && trackEdges !== 1) err(`extension ${nid} must have exactly 1 track edge, has ${trackEdges}`);
  }

  for (const [mid, m] of Object.entries(miscons)) if (!skills[m.skill]) err(`${mid}.skill ${m.skill} undefined`);

  for (const [nid, n] of Object.entries(nodes)) {
    for (const c of n.cells) {
      for (const s of c.steps) {
        for (const ch of ((s["choices"] as { misconception?: string }[]) ?? [])) {
          if (ch.misconception && !miscons[ch.misconception]) err(`${nid} references undefined misconception ${ch.misconception}`);
        }
        const acc = (s["accepted"] as { misconceptionMap?: Record<string, string> }) ?? {};
        for (const ref of Object.values(acc.misconceptionMap ?? {})) if (!miscons[ref]) err(`${nid} references undefined misconception ${ref}`);
        const exp = (s["expected"] as { misconceptionMap?: Record<string, string> }) ?? {};
        for (const ref of Object.values(exp.misconceptionMap ?? {})) if (!miscons[ref]) err(`${nid} references undefined misconception ${ref}`);
      }
    }
  }

  return issues;
}
