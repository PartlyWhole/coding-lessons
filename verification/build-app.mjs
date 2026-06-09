// Debt 5 — build the REAL client app entry (packages/client/src/app/main.tsx) into
// static ESM assets servable by `python -m http.server` (no server logic).
//
// Why a build step exists at all: the shipped packages/client/index.html serves raw tsc
// output with bare specifiers (react, @codemirror/*, @trellis/*), and react ships
// CJS-only — unservable as browser ESM without bundling/vendoring. That is a DEFECT
// finding of this verification (see report); this bundle exists to verify the slice's
// BEHAVIOR end-to-end regardless.
//
// node:child_process stub: the @trellis/sandbox barrel eagerly re-exports the node-only
// local-CPython twin (defect finding #2). createLocalSandbox is never called in the
// browser, so a throwing stub is behavior-preserving.
import { build } from "esbuild";
import { mkdirSync, copyFileSync } from "node:fs";

const stubNodeOnly = {
  name: "stub-node-child-process",
  setup(b) {
    b.onResolve({ filter: /^node:child_process$/ }, () => ({ path: "cp", namespace: "stub" }));
    b.onLoad({ filter: /.*/, namespace: "stub" }, () => ({
      contents: 'export const spawnSync = () => { throw new Error("node-only: not available in the browser"); };',
      loader: "js",
    }));
  },
};

await build({
  entryPoints: ["../packages/client/src/app/main.tsx"],
  bundle: true,
  format: "esm",
  outfile: "app/a/b/main.js", // depth chosen so makeSandbox's ../../../sandbox/... worker URL resolves to /verification/sandbox/...
  jsx: "automatic",
  platform: "browser",
  plugins: [stubNodeOnly],
  define: { "process.env.NODE_ENV": '"production"' },
  logLevel: "info",
});

// Static assets: the module worker (must stay a separate file) + the compiled bundle.
mkdirSync("sandbox/dist/src", { recursive: true });
copyFileSync("../packages/sandbox/dist/src/pyodide-worker.js", "sandbox/dist/src/pyodide-worker.js");
copyFileSync("../packages/sandbox/dist/src/run-harness.js", "sandbox/dist/src/run-harness.js");
copyFileSync("bundle.json", "app/bundle.json");
console.log("static app assembled under verification/app/");
