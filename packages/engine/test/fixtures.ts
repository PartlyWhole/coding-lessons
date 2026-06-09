import type {
  Bundle,
  Graph,
  LearnerModel,
  RecognizeStep,
  RecallStep,
  PredictStep,
  SkillState,
} from "@trellis/schema";

// ---------------------------------------------------------------------------
// Skills (proving slice). Upstream edges mirror content/skills/*.taxonomy.yaml.
// ---------------------------------------------------------------------------
const skills: Bundle["skills"] = {
  "skill.output.print_literal": {
    id: "skill.output.print_literal",
    title: "Print a literal",
    description: "print(\"...\") on a string literal.",
    misconceptions: [],
    upstream: [],
  },
  "skill.string.literal": {
    id: "skill.string.literal",
    title: "String literal",
    description: "Text lives in quotes.",
    misconceptions: [],
    upstream: [],
  },
  "skill.var.assign": {
    id: "skill.var.assign",
    title: "Assign a variable",
    description: "name = value.",
    misconceptions: [],
    upstream: ["skill.string.literal"],
  },
  "skill.var.use": {
    id: "skill.var.use",
    title: "Use a variable",
    description: "Read a variable's value.",
    misconceptions: [],
    upstream: ["skill.var.assign"],
  },
  "skill.random.randint": {
    id: "skill.random.randint",
    title: "Get a random integer",
    description: "import random; random.randint(a, b) inclusive.",
    misconceptions: ["mis.random.no_import", "mis.random.range_off_by_one"],
    upstream: ["skill.var.assign", "skill.output.print_literal"],
  },
};

// ---------------------------------------------------------------------------
// Misconceptions for skill.random.randint (signatures mirror
// content/skills/random.taxonomy.yaml). hintLadder/feedback kept minimal —
// M2 does not consume them (hints are M4).
// ---------------------------------------------------------------------------
const misconceptions: Bundle["misconceptions"] = {
  "mis.random.no_import": {
    id: "mis.random.no_import",
    skill: "skill.random.randint",
    title: "Used random.randint without importing random",
    signature: {
      any: [
        { all: [{ astTag: "uses_random_name" }, { not: { astTag: "has_random_import" } }] },
        { runError: "runtime" },
        { choice: "b" },
      ],
    },
    hintLadder: [],
    feedback: "import random first.",
    skillDeltas: [{ skill: "skill.random.randint", kind: "misconception", weight: 0.4 }],
  },
  "mis.random.range_off_by_one": {
    id: "mis.random.range_off_by_one",
    skill: "skill.random.randint",
    title: "Shaved the inclusive upper bound",
    signature: {
      any: [
        { all: [{ testFailure: { caseIndex: 0 } }, { not: { runError: "runtime" } }] },
        { propertyFailed: true },
        { choice: "c" },
      ],
    },
    hintLadder: [],
    feedback: "randint includes both ends.",
    skillDeltas: [{ skill: "skill.random.randint", kind: "misconception", weight: 0.4 }],
  },
};

// ---------------------------------------------------------------------------
// Nodes: output (spine root) → variables (spine) ; random (extension).
// ---------------------------------------------------------------------------
const nodes: Bundle["nodes"] = {
  "node.output": {
    id: "node.output",
    title: "Output",
    track: "spine",
    requires: [],
    teaches: ["skill.output.print_literal", "skill.string.literal"],
    cells: ["cell.output.hello"],
  },
  "node.variables": {
    id: "node.variables",
    title: "Variables",
    track: "spine",
    requires: [
      { skill: "skill.string.literal", minMastery: 0.6, kind: "prerequisite" },
      { skill: "skill.output.print_literal", minMastery: 0.5, kind: "utility" },
    ],
    teaches: ["skill.var.assign", "skill.var.use"],
    cells: ["cell.variables.box"],
  },
  "node.random": {
    id: "node.random",
    title: "Roll the dice",
    track: "extension",
    requires: [
      { skill: "skill.var.assign", minMastery: 0.6, kind: "track" },
      { skill: "skill.output.print_literal", minMastery: 0.5, kind: "utility" },
    ],
    teaches: ["skill.random.randint"],
    cells: ["cell.random.intro", "cell.random.build"],
  },
};

// §4.1 derived indexes (materialized at compile time; the engine reads, never recomputes).
const producers: Bundle["producers"] = {
  "skill.output.print_literal": ["node.output"],
  "skill.string.literal": ["node.output"],
  "skill.var.assign": ["node.variables"],
  "skill.var.use": ["node.variables"],
  "skill.random.randint": ["node.random"],
};

const requirements: Bundle["requirements"] = {
  "node.output": [],
  "node.variables": [
    { skill: "skill.string.literal", minMastery: 0.6, kind: "prerequisite" },
    { skill: "skill.output.print_literal", minMastery: 0.5, kind: "utility" },
  ],
  "node.random": [
    { skill: "skill.var.assign", minMastery: 0.6, kind: "track" },
    { skill: "skill.output.print_literal", minMastery: 0.5, kind: "utility" },
  ],
};

export const bundle: Bundle = {
  contentVersion: "2026.06.0-test",
  skills,
  nodes,
  cells: {
    "cell.output.hello": {
      id: "cell.output.hello",
      nodeId: "node.output",
      title: "Hello",
      certifies: ["skill.output.print_literal", "skill.string.literal"],
      steps: [],
    },
    "cell.variables.box": {
      id: "cell.variables.box",
      nodeId: "node.variables",
      title: "Box",
      certifies: ["skill.var.assign"],
      steps: [],
    },
    "cell.random.intro": {
      id: "cell.random.intro",
      nodeId: "node.random",
      title: "Intro",
      certifies: ["skill.random.randint"],
      steps: [],
    },
    "cell.random.build": {
      id: "cell.random.build",
      nodeId: "node.random",
      title: "Build",
      certifies: ["skill.random.randint"],
      steps: [],
    },
  },
  misconceptions,
  producers,
  requirements,
};

export const graph: Graph = { nodes, producers, requirements };

// ---------------------------------------------------------------------------
// Sample steps for diagnose/detect tests.
// ---------------------------------------------------------------------------

// recognize: choice a correct; b→no_import; c→off_by_one; d→no misconception (mismatch path).
export const recognizeStep: RecognizeStep = {
  id: "cell.random.intro#3",
  kind: "recognize",
  skills: ["skill.random.randint"],
  prompt: "Which program is correct?",
  choices: [
    { id: "a", label: "import random; random.randint(1,100)" },
    { id: "b", label: "random.randint(1,100)  # no import", misconception: "mis.random.no_import" },
    { id: "c", label: "import random; random.randint(1,99)", misconception: "mis.random.range_off_by_one" },
    { id: "d", label: "a deliberately unclassified wrong answer" },
  ],
  correctChoiceId: "a",
};

// recall: accepted normalized answers + a misconceptionMap entry.
export const recallStep: RecallStep = {
  id: "cell.random.recall#1",
  kind: "recall",
  skills: ["skill.random.randint"],
  prompt: "What must you do before random.randint?",
  accepted: {
    normalized: ["import random"],
    misconceptionMap: { "use random.randint": "mis.random.no_import" },
  },
};

// predict (choice mode): expected accepts choice id "a"; choice b carries a misconception.
export const predictStep: PredictStep = {
  id: "cell.random.intro#2",
  kind: "predict",
  skills: ["skill.random.randint"],
  prompt: "What happens when you run this?",
  code: "number = random.randint(1, 100)\nprint(number)",
  choices: [
    { id: "a", label: "NameError — random is not defined" },
    { id: "b", label: "prints a random number", misconception: "mis.random.no_import" },
    { id: "c", label: "prints 0" },
  ],
  expected: { normalized: ["a"] },
  reveal: "run-and-show",
};

// ---------------------------------------------------------------------------
// Learner-model helpers.
// ---------------------------------------------------------------------------
export function skillState(mastery: number): SkillState {
  return {
    mastery,
    attempts: 1,
    passes: 1,
    lastSeen: "2026-06-08T00:00:00.000Z",
    misconceptionCounts: {},
  };
}

export function model(masteries: Record<string, number>): LearnerModel {
  const skills: LearnerModel["skills"] = {};
  for (const [id, m] of Object.entries(masteries)) skills[id] = skillState(m);
  return { learnerId: "L1", skills, contentVersion: "2026.06.0-test" };
}
