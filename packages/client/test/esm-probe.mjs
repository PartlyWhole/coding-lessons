// Boot minimal DOM globals (a browser package legitimately touches the DOM), then import the
// built barrel. A real ESM init cycle throws "Cannot access 'X' before initialization".
//
// Most @trellis/* deps export TS SOURCE (exports: ./src/index.ts) and are transpiled on the fly
// by vitest/the bundler; plain `node` cannot load them. We register a tiny resolve hook that
// redirects @trellis/{engine,persist,sandbox} to their built dist so this probe runs entirely
// offline against real compiled JS — the graph that would actually surface an ESM init cycle.
import { register } from "node:module";
register("./esm-probe-loader.mjs", import.meta.url);

import { Window } from "happy-dom";

const win = new Window({ url: "http://localhost/" });
for (const k of ["window", "document", "navigator", "HTMLElement", "Element", "Node", "customElements", "getComputedStyle", "DOMParser", "MutationObserver"]) {
  if (globalThis[k] === undefined && win[k] !== undefined) globalThis[k] = win[k];
}
globalThis.window ??= win;
globalThis.document ??= win.document;

const mod = await import("../dist/src/index.js");
const required = ["CellRunner", "useCellRunner", "createEventBus", "EditorPane", "HintPanel", "FeedbackPanel", "PeekBackPanel", "StepView"];
const missing = required.filter((k) => mod[k] === undefined);
if (missing.length > 0) {
  console.error("esm-probe FAIL: missing exports:", missing.join(", "));
  process.exit(1);
}
console.log("esm-probe OK: barrel imported, no ESM init cycle,", required.length, "exports present");
