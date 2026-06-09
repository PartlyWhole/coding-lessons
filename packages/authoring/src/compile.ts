import type { Bundle, Skill, ConceptNode, Cell, Misconception } from "@trellis/schema";
import type { Loaded, RawMiscon, RawSkill, RawNode, RawCell } from "./raw-types.js";
import { buildProducers, buildRequirements } from "./indexes.js";
import { canonicalJson, sha256hex } from "./hash.js";

function compileMisconception(m: RawMiscon): Misconception {
  const out: Misconception = {
    id: m.id,
    skill: m.skill,
    title: m.title,
    signature: m.signature,
    hintLadder: m.hintLadder as Misconception["hintLadder"],
    feedback: m.feedback,
  };
  if (m.skillDeltas !== undefined) {
    out.skillDeltas = m.skillDeltas as NonNullable<Misconception["skillDeltas"]>;
  }
  return out;
}

function compileSkill(s: RawSkill): Skill {
  return {
    id: s.id,
    title: s.title,
    description: s.description,
    misconceptions: (s.misconceptions ?? []).map((m) => m.id),
    upstream: s.upstream ?? [],
  };
}

function compileCell(raw: RawCell, nodeId: string): Cell {
  return {
    id: raw.id,
    nodeId,
    title: raw.title,
    steps: raw.steps as unknown as Cell["steps"],
    certifies: raw.certifies ?? [],
  };
}

function compileNode(n: RawNode): ConceptNode {
  return {
    id: n.id,
    title: n.title,
    track: n.track,
    requires: (n.requires ?? []).map((r) => ({
      skill: r.skill,
      minMastery: r.minMastery,
      kind: r.kind,
    })),
    teaches: n.teaches ?? [],
    cells: n.cells.map((c) => c.id),
  };
}

export function compile(loaded: Loaded): Bundle {
  // NOTE: schema validation is performed by gate 1, not inside compile().
  // compile() only constructs and returns the bundle so downstream code/tests
  // remain callable; full-bundle validation is a later (gate 1) responsibility.
  const skills: Record<string, Skill> = {};
  const misconceptions: Record<string, Misconception> = {};
  const nodes: Record<string, ConceptNode> = {};
  const cells: Record<string, Cell> = {};

  for (const s of Object.values(loaded.skills)) {
    skills[s.id] = compileSkill(s);
    for (const m of s.misconceptions ?? []) misconceptions[m.id] = compileMisconception(m);
  }
  for (const n of Object.values(loaded.nodes)) {
    nodes[n.id] = compileNode(n);
    for (const c of n.cells) cells[c.id] = compileCell(c, n.id);
  }

  const producers = buildProducers(loaded);
  const requirements = buildRequirements(loaded);

  const body = { skills, nodes, cells, misconceptions, producers, requirements };
  const contentVersion = "ca-" + sha256hex(canonicalJson(body)).slice(0, 16);

  const bundle = { contentVersion, ...body };
  return bundle as Bundle;
}
