// M6.5 defining-gate page entry (Task 14). Hosts the REAL TrellisApp over the fixture
// bundle (m65-bundle.json, emitted by build-m65-pygame.mjs) with the production
// sandbox (pooled Pyodide workers) and the production pygame runtime — the only
// harness affordances are the preset window counters and window.__M65 hooks the
// Playwright driver calls for the determinism check (c).
import { createRoot } from "react-dom/client";
import { TrellisApp } from "../packages/client/src/app/TrellisApp.js";
import { makePygameRuntime } from "../packages/client/src/app/makePygameRuntime.js";
import { createSandbox, browserWorkerFactory, toHeadlessStep, composeSubmission, wrapGraphicalSandbox } from "../packages/sandbox/src/index.browser.js";
import { evaluate, canonicalDiagnosis } from "../packages/engine/src/index.js";
import { EditorView } from "@codemirror/view";
import type { Bundle, BuildStep, Diagnosis } from "@trellis/schema";

declare global {
  interface Window {
    __trellisFrameTick: number;
    __trellisKeySeen: number;
    gameGen?: number;
    __M65: {
      doubleEvaluate(code: string): Promise<{ a: string; b: string; correct: boolean; attribution: string; misconceptionId?: string }>;
      setEditor(text: string): void;
    };
  }
}

window.__trellisFrameTick = 0;
window.__trellisKeySeen = 0;

const workerUrl = new URL("./m65-pyodide-worker.js", import.meta.url);
const sandbox = createSandbox({ workerFactory: browserWorkerFactory(workerUrl) });
const pygameRuntime = makePygameRuntime(sandbox);

const CONTENT_VERSION = "m65-fixture@1";
const CELL_ID = "cell.m65.bounce";

// (c) determinism: grade the SAME submission twice through the exact production path
// (toHeadlessStep + composeSubmission + wrapGraphicalSandbox + frozen evaluate) with
// FIXED DiagnoseEffects, and return the two canonicalDiagnosis JSON strings.
async function doubleEvaluate(code: string) {
  const res = await fetch(new URL("./m65-bundle.json", import.meta.url).href);
  const bundle = (await res.json()) as Bundle;
  const cell = bundle.cells[CELL_ID]!;
  const step = cell.steps[0] as BuildStep;
  const fx = { id: "diag-m65", learnerId: "L", now: "2026-06-10T00:00:00.000Z" };
  const headless = toHeadlessStep(step);
  const wrapped = wrapGraphicalSandbox(sandbox);
  const sub = { kind: "build" as const, code: composeSubmission(step, code) };
  const a: Diagnosis = await evaluate(headless, sub, wrapped, bundle, fx);
  const b: Diagnosis = await evaluate(headless, sub, wrapped, bundle, fx);
  return {
    a: JSON.stringify(canonicalDiagnosis(a)),
    b: JSON.stringify(canonicalDiagnosis(b)),
    correct: a.correct,
    attribution: a.attribution,
    ...(a.misconceptionId !== undefined ? { misconceptionId: a.misconceptionId } : {}),
  };
}

// Harness affordance: replace the editor document THROUGH the real CodeMirror view
// (the updateListener drives the app's onChange exactly as typing would). Raw
// keyboard.type of multiline Python fights lang-python auto-indent.
function setEditor(text: string): void {
  const host = document.querySelector(".cm-editor");
  if (!host) throw new Error("no editor mounted");
  const view = EditorView.findFromDOM(host as HTMLElement);
  if (!view) throw new Error("no EditorView behind .cm-editor");
  view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text } });
}

function getEditor(): string {
  const host = document.querySelector(".cm-editor");
  if (!host) throw new Error("no editor mounted");
  const view = EditorView.findFromDOM(host as HTMLElement);
  if (!view) throw new Error("no EditorView behind .cm-editor");
  return view.state.doc.toString();
}

// Debug affordance: replicate the testRunner's per-case driver and surface the RAW
// RunResult (the engine's tests signal keeps only the error TYPE).
async function debugTestRun(code: string): Promise<unknown> {
  const res = await fetch(new URL("./m65-bundle.json", import.meta.url).href);
  const bundle = (await res.json()) as Bundle;
  const step = bundle.cells[CELL_ID]!.steps[0] as BuildStep;
  const wrapped = wrapGraphicalSandbox(sandbox);
  const composed = composeSubmission(step, code);
  const driver =
    composed +
    "\nimport random as _sd\n_sd.seed(7)\n_t_res = __trellis_sim(0, 240.0)\nprint(repr(_t_res))";
  return wrapped.run({ code: driver, timeoutMs: 60000, memoryMb: 256 });
}

window.__M65 = { doubleEvaluate, setEditor, getEditor, debugTestRun } as typeof window.__M65 & {
  debugTestRun: typeof debugTestRun;
  getEditor: typeof getEditor;
};

const root = createRoot(document.getElementById("root")!);
root.render(
  <TrellisApp
    bundleUrl={new URL("./m65-bundle.json", import.meta.url).href}
    contentVersion={CONTENT_VERSION}
    cellId={CELL_ID}
    sandbox={sandbox}
    warmup={() => sandbox.warmup()}
    pygameRuntime={pygameRuntime}
  />,
);
