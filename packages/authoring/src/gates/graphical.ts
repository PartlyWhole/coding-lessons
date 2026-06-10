// Gate 10 (E-17): graphical-step authoring lint, gates-8/9 style. For every BuildStep
// with runtime "pygame" (§17.4):
//   (a) evaluator.graphical MUST be present — and a graphical block on a non-pygame step
//       is an error (the schema deliberately does not enforce the pairing; this lint does);
//   (b) the entrypoints named in graphical.entrypoints (update, plus init/probe when
//       present) must exist as `def <name>` in the step's starterCode (AST-level check);
//   (c) frames ≤ 600 (warn above; §17.7 grading budget) and inputTape.length ≤ frames
//       (error: tape frames beyond `frames` can never be simulated);
//   (d) the locked-preamble contract (§17.6, amended by design-note 2026-06-10): if
//       lockedRegions is present it must cover line 1 — the import/scaffold preamble.
// Lockstep port: content/validate.py carries the same checks (same messages in substance).
import type { Loaded, RawStep } from "../raw-types.js";
import type { GateIssue } from "./types.js";
import { parsePython } from "../ast/python.js";
import { walk, type JsonNode } from "../ast/json-ast.js";

const G = "10-graphical";

interface GraphicalLike {
  entrypoints?: { init?: string; update?: string; probe?: string };
  inputTape?: unknown[];
  dt?: number;
  frames?: number;
}

interface LineRangeLike {
  startLine?: number;
  endLine?: number;
}

function definedFunctionNames(code: string): Set<string> | null {
  const p = parsePython(code);
  if (p.syntaxError) return null;
  const names = new Set<string>();
  for (const n of walk(p.ast as JsonNode)) {
    if (n._type === "FunctionDef" || n._type === "AsyncFunctionDef") {
      names.add(n["name"] as string);
    }
  }
  return names;
}

export function gateGraphical(loaded: Loaded): GateIssue[] {
  const issues: GateIssue[] = [];
  const push = (message: string, level: "error" | "warn" = "error") =>
    issues.push({ gate: G, level, message });

  for (const n of Object.values(loaded.nodes)) {
    for (const c of n.cells) {
      for (const s of c.steps as RawStep[]) {
        const ev = s["evaluator"] as { graphical?: GraphicalLike } | undefined;
        const graphical = ev?.graphical;
        const isPygame = s.kind === "build" && s["runtime"] === "pygame";

        // (a) pairing, both directions.
        if (isPygame && !graphical) {
          push(
            `${s.id}: runtime "pygame" without an evaluator.graphical block — a pygame ` +
              `step cannot be graded headlessly without entrypoints/inputTape/dt/frames (§17.4)`,
          );
          continue;
        }
        if (!isPygame && graphical) {
          push(
            `${s.id}: evaluator.graphical on a non-pygame step (runtime ` +
              `${JSON.stringify(s["runtime"] ?? null)}) — graphical grading is meaningful ` +
              `only on a build step with runtime "pygame" (§17.4)`,
          );
          continue;
        }
        if (!graphical) continue;

        // (b) entrypoints exist as `def <name>` in starterCode.
        const starter = (s["starterCode"] as string | undefined) ?? "";
        const defs = definedFunctionNames(starter);
        if (defs === null) {
          push(
            `${s.id}: starterCode does not parse (syntax error) — graphical entrypoints ` +
              `cannot be verified, and a pygame starter must carry the locked preamble scaffold`,
          );
        } else {
          const ep = graphical.entrypoints ?? {};
          for (const key of ["init", "update", "probe"] as const) {
            const name = ep[key];
            if (name === undefined) continue;
            if (!defs.has(name)) {
              push(
                `${s.id}: graphical.entrypoints.${key} ${JSON.stringify(name)} has no ` +
                  `\`def ${name}\` in starterCode — the headless harness would fail to drive it`,
              );
            }
          }
        }

        // (c) frame budget + tape length.
        const frames = graphical.frames;
        if (typeof frames === "number" && frames > 600) {
          push(
            `${s.id}: graphical.frames=${frames} exceeds the §17.7 grading budget of 600 ` +
              `(keep frames ≤ 600 so grading stays bounded)`,
            "warn",
          );
        }
        const tape = graphical.inputTape;
        if (Array.isArray(tape) && typeof frames === "number" && tape.length > frames) {
          push(
            `${s.id}: graphical.inputTape has ${tape.length} entries but frames=${frames} — ` +
              `tape entries beyond \`frames\` are never simulated (short tape = trailing empty frames)`,
          );
        }

        // (d) locked-preamble contract.
        const locked = s["lockedRegions"] as LineRangeLike[] | undefined;
        if (locked !== undefined) {
          const coversLine1 = locked.some(
            (r) =>
              typeof r.startLine === "number" &&
              typeof r.endLine === "number" &&
              r.startLine <= 1 &&
              r.endLine >= 1,
          );
          if (!coversLine1) {
            push(
              `${s.id}: lockedRegions does not cover line 1 — the import/scaffold preamble ` +
                `must be locked (§17.6; the headless-aware preamble is the grading gate)`,
            );
          }
        }
      }
    }
  }
  return issues;
}
