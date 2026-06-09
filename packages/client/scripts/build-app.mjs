// Static app build (frozen M5 contract: bootable from `python -m http.server`, NO server
// logic). Fixes the Debt-5 static-host defects:
//   1. bundles main.tsx (react is CJS-only → unservable unbundled) + CSS + woff2 fonts;
//   2. browser-platform resolution picks @trellis/sandbox's browser entry — zero node
//      builtins in the graph (no stubbing) — and this script ASSERTS that;
//   3. bundles the Pyodide worker as a SEPARATE sibling module file so makeSandbox's
//      `new URL("./pyodide-worker.js", import.meta.url)` resolves in the served layout.
// Also emits bundle.json via the authoring CLI and injects its contentVersion.
import { build } from "esbuild";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, readdirSync, realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const pkgRoot = fileURLToPath(new URL("..", import.meta.url));
const outDir = path.join(pkgRoot, "dist/app");
mkdirSync(outDir, { recursive: true });

// 1. Compile the content bundle and read its version. realpath matters: the CLI's
// "executed directly" guard compares import.meta.url to argv[1], which a pnpm
// symlink path would fail silently.
const authoringCli = realpathSync(path.join(pkgRoot, "node_modules/@trellis/authoring/dist/src/cli.js"));
execFileSync(
  "node",
  [
    authoringCli,
    "build",
    "--out", path.join(outDir, "bundle.json"),
    "--content", path.join(pkgRoot, "../../content"),
  ],
  { stdio: "inherit" },
);
const contentVersion = JSON.parse(readFileSync(path.join(outDir, "bundle.json"), "utf8")).contentVersion;

const common = {
  bundle: true,
  format: "esm",
  platform: "browser",
  sourcemap: true,
  logLevel: "info",
  define: {
    "process.env.NODE_ENV": '"production"',
    __TRELLIS_CONTENT_VERSION__: JSON.stringify(contentVersion),
  },
};

// 2. The app bundle (CSS + fonts ride along).
await build({
  ...common,
  entryPoints: [path.join(pkgRoot, "src/app/main.tsx")],
  outdir: outDir,
  jsx: "automatic",
  loader: { ".woff2": "file", ".woff": "file" },
  assetNames: "assets/[name]-[hash]",
});

// 3. The Pyodide module worker — a separate file, NOT an import of the app bundle.
const workerEntry = realpathSync(path.join(pkgRoot, "node_modules/@trellis/sandbox/src/pyodide-worker.ts"));
await build({
  ...common,
  entryPoints: [workerEntry],
  outfile: path.join(outDir, "pyodide-worker.js"),
});

// 4. Gate: the browser outputs must contain zero node: specifiers.
for (const f of readdirSync(outDir)) {
  if (!f.endsWith(".js")) continue;
  const src = readFileSync(path.join(outDir, f), "utf8");
  if (/["']node:/.test(src)) {
    throw new Error(`browser bundle ${f} contains a node: specifier — the graph is not browser-safe`);
  }
}
console.log(`static app built → ${outDir} (contentVersion ${contentVersion})`);
