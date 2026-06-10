// E-14 three-way differential: a signature using the NEW §6.3 node types (Subscript, List)
// must evaluate IDENTICALLY under all three lockstep implementations of the grammar/oracle:
//   (1) the authoring TS matcher (src/ast/matcher.ts evalTags),
//   (2) the sandbox AstQuery interpreter (@trellis/sandbox parseAndMatch, local CPython twin),
//   (3) content/verify/harness.py's eval_tags — the ACTUAL harness source, executed up to its
//       "execution" section marker so the oracle itself (not a copy) is what we differential.
import { describe, it, expect } from "vitest";
import { resolve } from "node:path";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { createLocalSandbox } from "@trellis/sandbox";
import { evalTags, type TagQuery } from "../src/ast/matcher.js";

const ROOT = resolve(__dirname, "../../..");
const HARNESS = resolve(ROOT, "content/verify/harness.py");
const QUERY_MARKER = "# ------------------------------------------------------------------- §6.3 AstQuery";
const EXEC_MARKER = "# ------------------------------------------------------------------- execution";

/** Run harness.py's own eval_tags (its §6.3 section, cut out of the actual source). */
function harnessEvalTags(code: string, queries: TagQuery[]): string[] {
  const src = readFileSync(HARNESS, "utf8");
  const start = src.indexOf(QUERY_MARKER);
  const end = src.indexOf(EXEC_MARKER);
  if (start === -1 || end === -1) throw new Error("harness.py §6.3/execution markers not found");
  const section = src.slice(start, end);
  const driver =
    `import ast, json, sys\n` +
    section +
    `\npayload = json.loads(sys.stdin.read())\n` +
    `tags = eval_tags(payload["code"], payload["queries"])\n` +
    `print(json.dumps(sorted(tags) if tags is not None else None))\n`;
  const r = spawnSync("python3", ["-c", driver], {
    input: JSON.stringify({ code, queries }),
    encoding: "utf8",
    maxBuffer: 1 << 24,
  });
  if (r.status !== 0) throw new Error(`harness eval_tags driver failed: ${r.stderr}`);
  return JSON.parse(r.stdout.trim()) as string[];
}

const QUERIES: TagQuery[] = [
  {
    tag: "index_is_one",
    query: {
      node: "Subscript",
      field: {
        value: { node: "Name", where: { attr: "id", eq: "answers" } },
        slice: { node: "Constant", where: { attr: "value", eq: 1 } },
      },
    },
  },
  {
    tag: "const_subscript",
    query: { node: "Subscript", field: { slice: { node: "Constant" } } },
  },
  {
    tag: "list_with_certain",
    query: {
      node: "List",
      field: { elts: { node: "Constant", where: { attr: "value", eq: "It is certain." } } },
    },
  },
  {
    tag: "subscript_in_call",
    query: { node: "Subscript", within: { node: "Call", where: { calls: "print" } } },
  },
];

const PROGRAMS = [
  // shapes from the content track's E-14 proxy-tag sites (bigger-brain.taxonomy.yaml)
  'answers = ["It is certain.", "Signs point to yes."]\nprint(answers[1])',
  'answers = ["It is certain.", "Signs point to yes."]\nprint(answers[0])',
  'answers = ["It is certain.", "Signs point to yes."]\nprint(answers["0"])',
  "answers = [1, 2]\nprint(answers[idx])",
  "print(other[1])",
  "answers = ()\nx = 1",
];

describe("E-14 differential: Subscript/List agree across all three implementations", () => {
  const sb = createLocalSandbox();

  it("authoring TS == sandbox twin == harness.py on every program", async () => {
    for (const code of PROGRAMS) {
      const ts = [...(evalTags(code, QUERIES) ?? new Set<string>())].sort();
      const sandbox = (
        await sb.parseAndMatch(code, QUERIES as unknown as Parameters<typeof sb.parseAndMatch>[1])
      ).sort();
      const harness = harnessEvalTags(code, QUERIES).sort();
      expect({ code, tags: sandbox }).toEqual({ code, tags: ts });
      expect({ code, tags: harness }).toEqual({ code, tags: ts });
    }
  });
});
