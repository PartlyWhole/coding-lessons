import { resolve, dirname } from "node:path";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { loadContent } from "./load.js";
import { compile } from "./compile.js";
import { runAllGates } from "./gates/run.js";
import { gradeBuild } from "./grade.js";

type Emit = (s: string) => void;

function parseFlags(args: string[]): { positionals: string[]; flags: Record<string, string | boolean> } {
  const positionals: string[] = [];
  const flags: Record<string, string | boolean> = {};
  for (let i = 0; i < args.length; i++) {
    const a = args[i]!;
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = args[i + 1];
      if (next !== undefined && !next.startsWith("--")) {
        flags[key] = next;
        i++;
      } else {
        flags[key] = true;
      }
    } else {
      positionals.push(a);
    }
  }
  return { positionals, flags };
}

function contentRoot(flags: Record<string, string | boolean>): string {
  return typeof flags["content"] === "string" ? resolve(flags["content"]) : resolve(process.cwd(), "content");
}

/** Returns a process exit code (0 ok, 1 gate failure, 2 usage). `emit` defaults to stdout. */
export function main(argv: string[], emit: Emit = (s) => { process.stdout.write(s); }): number {
  const [cmd, ...rest] = argv;
  const { positionals, flags } = parseFlags(rest);
  const noExec = flags["no-exec"] === true;

  if (cmd === "lint") {
    const loaded = loadContent(contentRoot(flags));
    const report = runAllGates(loaded, compile(loaded), { runExecGates: !noExec });
    emit(`nodes=${report.stats.nodes} skills=${report.stats.skills} misconceptions=${report.stats.misconceptions} cells=${report.stats.cells}\n`);
    for (const i of report.issues) emit(`${i.level.toUpperCase()} [${i.gate}] ${i.message}\n`);
    const errCount = report.issues.filter((x) => x.level === "error").length;
    emit(`\nRESULT: ${report.ok ? "PASS" : `FAIL (${errCount} errors)`}\n`);
    return report.ok ? 0 : 1;
  }

  if (cmd === "build") {
    const loaded = loadContent(contentRoot(flags));
    const bundle = compile(loaded);
    const report = runAllGates(loaded, bundle, { runExecGates: !noExec });
    const out = typeof flags["out"] === "string" ? resolve(flags["out"]) : resolve(process.cwd(), "bundle.json");
    if (!existsSync(dirname(out))) mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, JSON.stringify(bundle, null, 2));
    emit(`wrote ${out} (contentVersion ${bundle.contentVersion})\n`);
    for (const i of report.issues.filter((x) => x.level === "error")) emit(`ERROR [${i.gate}] ${i.message}\n`);
    if (!report.ok) {
      emit(`\nRESULT: FAIL (${report.issues.filter((x) => x.level === "error").length} errors) — bundle emitted for inspection\n`);
    } else {
      emit(`\nRESULT: PASS\n`);
    }
    return report.ok ? 0 : 1;
  }

  if (cmd === "grade") {
    const [stepId, file] = positionals;
    if (!stepId || !file) {
      emit("usage: trellis grade <stepId> <submission-file> [--content <dir>]\n");
      return 2;
    }
    const loaded = loadContent(contentRoot(flags));
    const submission = readFileSync(resolve(file), "utf8");
    const res = gradeBuild(loaded, stepId, submission);
    emit(`step ${res.stepId}\nattribution: ${res.attribution}\n`);
    if (res.misconceptionId) emit(`misconception: ${res.misconceptionId}\n`);
    return 0;
  }

  emit("usage: trellis <lint|build|grade> [...]\n");
  return 2;
}

// bin entrypoint — run main() only when executed directly (not when imported).
if (import.meta.url === `file://${process.argv[1]}`) {
  process.exit(main(process.argv.slice(2)));
}
