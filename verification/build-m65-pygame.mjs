// Builds the M6.5 defining-gate page: bundles the entry (React app + engine +
// sandbox graphical path) and the Pyodide worker, and emits the fixture bundle JSON.
// Pattern: packages/client/scripts/build-app.mjs (browser platform, zero node:
// specifiers asserted).
import { build } from "esbuild";
import { writeFileSync, readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { fixtureBundle } from "./m65-fixture.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));

writeFileSync(path.join(here, "m65-bundle.json"), JSON.stringify(fixtureBundle(), null, 2));

const common = {
  bundle: true,
  format: "esm",
  platform: "browser",
  sourcemap: false,
  logLevel: "info",
  define: { "process.env.NODE_ENV": '"production"' },
  // the entry lives in verification/ but its react/codemirror deps live in the
  // client package's node_modules (pnpm layout) — resolve from there too.
  nodePaths: [path.join(here, "../packages/client/node_modules")],
};

await build({
  ...common,
  entryPoints: [path.join(here, "m65-pygame-entry.tsx")],
  outfile: path.join(here, "m65-pygame.js"),
  jsx: "automatic",
});

await build({
  ...common,
  entryPoints: [path.join(here, "../packages/sandbox/src/pyodide-worker.ts")],
  outfile: path.join(here, "m65-pyodide-worker.js"),
});

for (const f of ["m65-pygame.js", "m65-pyodide-worker.js"]) {
  const src = readFileSync(path.join(here, f), "utf8");
  if (/["']node:/.test(src)) throw new Error(`${f} contains a node: specifier`);
}
console.log("m65 defining-gate page built");
