// Source-shape (pre-compile) types. These mirror the authored YAML, INCLUDING source-only
// fields (triggers/notTriggers/upstream/_skill/_file) that the Bundle does not carry.
import type { Signature } from "@trellis/schema";

export interface RawFixture {
  stepKind: "build" | "predict" | "recognize" | "recall";
  code?: string;
  choice?: string;
  input?: string;
}

export interface RawMiscon {
  id: string;
  skill: string;
  title: string;
  signature: Signature;
  hintLadder: unknown[];
  feedback: string;
  skillDeltas?: unknown[];
  triggers?: RawFixture[];
  notTriggers?: RawFixture[];
  _skill?: string;
  _file?: string;
}

export interface RawSkill {
  id: string;
  title: string;
  description: string;
  upstream?: string[];
  misconceptions?: RawMiscon[];
  _file?: string;
}

export interface RawRequirement {
  skill: string;
  minMastery: number;
  kind: "prerequisite" | "utility" | "track";
}

export interface RawCell {
  id: string;
  title: string;
  certifies?: string[];
  steps: RawStep[];
}

// Steps are kept loose at load time (compile.ts validates against the schema Step union).
export interface RawStep {
  id: string;
  kind: "watch" | "predict" | "recognize" | "recall" | "build";
  [k: string]: unknown;
}

export interface RawNode {
  id: string;
  title: string;
  track: "spine" | "extension";
  requires?: RawRequirement[];
  teaches?: string[];
  cells: RawCell[];
  _file?: string;
}

export interface Loaded {
  nodes: Record<string, RawNode>;
  skills: Record<string, RawSkill>;
  miscons: Record<string, RawMiscon>;
}
