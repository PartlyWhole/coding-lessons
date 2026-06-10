// Resolution shim for the offline ESM acyclicity probe (esm-probe.mjs).
//
// The workspace convention is that most @trellis/* packages export TypeScript SOURCE
// (package.json "exports": "./src/index.ts"); consumers (vitest, the bundler) transpile on the
// fly. Plain `node` cannot load a `.ts` source file, so when we import the BUILT client barrel
// (dist/src/index.js) under node its transitive @trellis/{engine,persist,sandbox} imports would
// fail to resolve. We redirect those specifiers to each package's built dist/src/index.js so the
// probe runs entirely offline against real compiled JS — exactly the graph that would surface a
// genuine ESM init cycle. (@trellis/schema already maps to dist via its own "exports".)
const ROOT = new URL("../../", import.meta.url); // -> packages/
const REDIRECTS = {
  "@trellis/engine": "engine/dist/src/index.js",
  "@trellis/persist": "persist/dist/src/index.js",
  "@trellis/sandbox": "sandbox/dist/src/index.js",
  "@trellis/telemetry": "telemetry/dist/src/index.js", // M6: client imports the bus contract + attach
};

export async function resolve(specifier, context, nextResolve) {
  const target = REDIRECTS[specifier];
  if (target !== undefined) {
    return { url: new URL(target, ROOT).href, shortCircuit: true };
  }
  return nextResolve(specifier, context);
}
