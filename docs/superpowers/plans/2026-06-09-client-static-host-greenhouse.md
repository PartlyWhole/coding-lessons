# Client Static Host + Greenhouse Design Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `@trellis/client` boot as a real static app from `python -m http.server` (esbuild build, browser-safe `@trellis/sandbox` entry, fixed workerUrl, self-hosted Fontsource fonts) and land the approved Greenhouse design (3 drop-in files + every ⚑ markup addition) without touching the frozen interaction semantics.

**Architecture:** Two halves. (1) Packaging: conditional `exports` on `@trellis/sandbox` give browsers a graph with zero node builtins while node consumers keep the full barrel; a `scripts/build-app.mjs` esbuild step in the client bundles `main.tsx` (+ CSS + woff2 fonts) and the Pyodide worker as a sibling module file into `packages/client/dist/app/`, generates `bundle.json` via the authoring CLI, and injects `contentVersion` at build time. (2) Design: drop in `trellis-tokens.css` / `trellis-ui.css` / `trellis-editor-theme.ts` verbatim from the handback, apply each flagged markup addition (feedback classes/chips, cell header eyebrow+pips, app-state wrappers incl. warming, watch-step tiny markdown, placeholders), update `attribution.ts` hexes, and add the lockedRegions line-decoration/gutter-marker styling contract.

**Tech Stack:** React 19, CodeMirror 6, esbuild, @fontsource (baloo-2, nunito-sans, jetbrains-mono), vitest + happy-dom, Playwright (verification driver), pnpm + turbo.

**Frozen (do NOT alter):** one-step-at-a-time, keyed step replacement, hint pulled one level/press, level-4 confirm, misconception NEVER error-styled, no spinners (EVALUATING = disabled controls + depressed button), HintPanel null-on-empty (no hint button for raw syntax/runtime/mismatch), `prefers-reduced-motion` blocks in the CSS, silent lockedRegion rejection.

---

### Task 1: Browser-safe `@trellis/sandbox` entry (packaging seam only)

**Files:**
- Create: `packages/sandbox/src/index.browser.ts`
- Modify: `packages/sandbox/package.json` (exports map only)

- [ ] **Step 1:** Create `packages/sandbox/src/index.browser.ts` — the barrel minus the node-only CPython twin (`local-cpython.ts` is the ONLY module importing `node:child_process`):

```ts
// @trellis/sandbox — BROWSER entry: the Pyodide Web Worker grader host without the
// node-only local-CPython twin. This graph must contain ZERO node builtins so a
// bundler targeting the browser never sees node:child_process (Debt-5 defect 2).
export { createSandbox } from "./sandbox.js";
export type { SandboxConfig, ManagedSandbox } from "./sandbox.js";
export type { PoolStatus } from "./warm-pool.js";
export { realClock } from "./clock.js";
export type { Clock, Timer } from "./clock.js";
export type { WorkerLike, WorkerFactory } from "./protocol.js";
export { PYODIDE_VERSION, PINNED_PYODIDE_URL } from "./pinned.js";
export { browserWorkerFactory } from "./browser-worker.js";
export { parseAndMatch } from "./parse-and-match.js";
export type { RunFn } from "./parse-and-match.js";
export { AST_QUERY_INTERPRETER, buildMatchProgram, MATCH_SENTINEL } from "./ast-query.js";
export { RUN_HARNESS } from "./run-harness.js";
```

- [ ] **Step 2:** Update `packages/sandbox/package.json` exports to conditional form (existing node consumers — engine/client tests importing `createLocalSandbox` — resolve `default` and keep working; esbuild `platform: "browser"` resolves `browser`). Also expose the worker entry for the client build:

```json
"exports": {
  ".": {
    "types": "./src/index.ts",
    "browser": "./src/index.browser.ts",
    "default": "./src/index.ts"
  },
  "./pyodide-worker": "./src/pyodide-worker.ts"
}
```

- [ ] **Step 3:** Verify nothing in the browser graph references node builtins: `grep -rn "node:" packages/sandbox/src | grep -v local-cpython` → empty.
- [ ] **Step 4:** `pnpm --filter @trellis/sandbox typecheck && pnpm --filter @trellis/sandbox test` → green (no runtime logic changed).
- [ ] **Step 5:** `pnpm --filter @trellis/engine test` → green (its `createLocalSandbox` import still resolves via `default`).
- [ ] **Step 6:** Commit `refactor(sandbox): browser-safe entry via conditional exports (packaging seam only)`.

### Task 2: Land the three Greenhouse drop-in files + CSS module declaration

**Files:**
- Create: `packages/client/src/styles/trellis-tokens.css` (verbatim from handback FILE block 1)
- Create: `packages/client/src/styles/trellis-ui.css` (verbatim from handback FILE block 2)
- Create: `packages/client/src/editor/trellis-editor-theme.ts` (verbatim from handback FILE block 3)
- Create: `packages/client/src/styles/css.d.ts` → `declare module "*.css";` (so tsc accepts CSS imports)

- [ ] **Step 1:** Write the three files exactly as embedded in `docs/design/2026-06-09-design-handback.md` (strip only the surrounding markdown fences). Do not edit the CSS — `prefers-reduced-motion` blocks stay.
- [ ] **Step 2:** `pnpm --filter @trellis/client typecheck` → green (theme file compiles; `@lezer/highlight` is a transitive dep of `@codemirror/lang-python` — if tsc cannot resolve it, add `"@lezer/highlight": "^1.2.0"` to client dependencies).
- [ ] **Step 3:** Commit `feat(client): Greenhouse drop-in tokens/ui CSS + CodeMirror theme`.

### Task 3: attribution.ts final hexes

**Files:**
- Modify: `packages/client/src/attribution.ts` (hex values only; labels/shape unchanged)
- Modify: `packages/client/test/attribution.test.ts` (update expected hexes if asserted)

- [ ] **Step 1:** Update colors: pass `#1A7F4B`, misconception `#9C6310`, mismatch `#7E6A14`, syntax/runtime `#BE4039` (the `--attr-*-ink` values; still feed peek-back dots).
- [ ] **Step 2:** `pnpm --filter @trellis/client test -- attribution` → green (fix test expectations).
- [ ] **Step 3:** Commit `feat(client): final Greenhouse attribution ink hexes`.

### Task 4: FeedbackPanel — className, misconception title chip, error chip/message

**Files:**
- Modify: `packages/client/src/feedback/FeedbackPanel.tsx`
- Modify: `packages/client/src/CellRunner.tsx` (pass `misconceptionTitle`)
- Test: `packages/client/test/feedbackPanel.test.tsx`

- [ ] **Step 1:** Write failing tests: (a) panel root has `feedback feedback--misconception` class and NO inline style; (b) misconception title renders in `span.feedback-misconception-title`; (c) a runtime-error diagnosis (signals.runError `{type:"runtime", message:"TypeError: can only concatenate str (not \"int\") to str", line:3}`) renders chip text `TypeError · line 3` and `p.feedback-error-message` with the message; (d) a syntax error without a parsable class name renders `SyntaxError · line 1`; (e) pass renders no chip.
- [ ] **Step 2:** Implement:

```tsx
import type { Diagnosis } from "@trellis/schema";
import { attributionStyle } from "../attribution.js";

export interface FeedbackPanelProps {
  diagnosis: Diagnosis;
  misconceptionTitle?: string; // bundle.misconceptions[id].title (⚑ approved chip)
  misconceptionFeedback?: string;
  revealText?: string;
}

function errorChip(runError: { type: "syntax" | "runtime"; message: string; line?: number }): string {
  const cls = /^([A-Za-z_]\w*Error)\b/.exec(runError.message)?.[1]
    ?? (runError.type === "syntax" ? "SyntaxError" : "Error");
  return runError.line !== undefined ? `${cls} · line ${runError.line}` : cls;
}

export function FeedbackPanel({ diagnosis, misconceptionTitle, misconceptionFeedback, revealText }: FeedbackPanelProps): React.ReactElement {
  const sty = attributionStyle(diagnosis.attribution);
  const isError = diagnosis.attribution === "syntax" || diagnosis.attribution === "runtime";
  const runError = isError ? diagnosis.signals.runError : undefined;
  return (
    <div aria-label="feedback" className={`feedback feedback--${diagnosis.attribution}`}>
      <strong className="feedback-label">{sty.label}</strong>
      {misconceptionTitle !== undefined && <span className="feedback-misconception-title">{misconceptionTitle}</span>}
      {runError !== undefined && <span className="feedback-error-chip">{errorChip(runError)}</span>}
      {runError !== undefined && <p className="feedback-error-message">{runError.message}</p>}
      {misconceptionFeedback !== undefined && <p className="feedback-misconception">{misconceptionFeedback}</p>}
      {revealText !== undefined && <p className="feedback-reveal">{revealText}</p>}
    </div>
  );
}
```

- [ ] **Step 3:** In `CellRunner.tsx`, alongside `misconceptionFeedback`, resolve `misconceptionTitle = bundle.misconceptions[r.lastDiagnosis.misconceptionId]?.title` and pass it.
- [ ] **Step 4:** Run client tests → green. Commit `feat(client): Greenhouse FeedbackPanel markup (attribution class, title chip, error chip)`.

### Task 5: CellRunner header — eyebrow, kind badge, progress pips

**Files:**
- Modify: `packages/client/src/CellRunner.tsx`
- Test: `packages/client/test/cellRunner.test.tsx` (new assertions)

- [ ] **Step 1:** Failing test: rendering a 3-step cell on step 1 shows `.cell-eyebrow` text `Step 1 of 3`, `.cell-kind-badge` with the active step kind, and 3 `.pip`s where pip[0] has `is-now`; after advancing, pip[0] has `is-done`, pip[1] `is-now`.
- [ ] **Step 2:** Implement (data already in scope — `props.cell.steps` + active step id):

```tsx
const stepIndex = props.cell.steps.findIndex((s) => s.id === r.step.id);
...
<div className="cell-eyebrow">
  <span>Step {stepIndex + 1} of {props.cell.steps.length}</span>
  <span className="cell-kind-badge">{r.step.kind}</span>
</div>
<div className="cell-progress">
  {props.cell.steps.map((s, i) => (
    <span key={s.id} className={`pip${i < stepIndex ? " is-done" : i === stepIndex ? " is-now" : ""}`} />
  ))}
</div>
```

(placed above `.cell-title`, matching the artboard Shell.)
- [ ] **Step 3:** Tests green. Commit `feat(client): cell header eyebrow + kind badge + progress pips`.

### Task 6: WatchStepView tiny-markdown for `step.body`

**Files:**
- Create: `packages/client/src/markdown/tinyMarkdown.tsx`
- Modify: `packages/client/src/steps/WatchStepView.tsx`
- Test: `packages/client/test/tinyMarkdown.test.tsx`

- [ ] **Step 1:** Failing tests against the real corpus shapes (string_concat watch bodies): paragraphs split on blank lines; `**bold**` → `<strong>`; `` `code` `` → `<code>`; 4-space-indented runs → `<pre class="code">` with the 4-space indent stripped; mixed bodies keep order.
- [ ] **Step 2:** Implement a tiny deterministic subset (no dependency):

```tsx
// tinyMarkdown.tsx — the ⚑ watch-step markdown subset: paragraphs, **bold**,
// `inline code`, and 4-space-indented code → terrarium block (pre.code).
// Deliberately tiny + deterministic; NOT a general markdown engine.
import type { ReactNode } from "react";

function renderInline(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  // split on `code` and **bold** spans, preserving order
  const re = /(`[^`]+`|\*\*[^*]+\*\*)/g;
  let last = 0; let m: RegExpExecArray | null; let k = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const tok = m[0];
    if (tok.startsWith("`")) out.push(<code key={k++}>{tok.slice(1, -1)}</code>);
    else out.push(<strong key={k++}>{tok.slice(2, -2)}</strong>);
    last = m.index + tok.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function TinyMarkdown({ text }: { text: string }): React.ReactElement {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const blocks: React.ReactElement[] = [];
  let i = 0; let key = 0;
  while (i < lines.length) {
    if (lines[i]!.trim() === "") { i++; continue; }
    if (/^ {4,}/.test(lines[i]!)) {
      const code: string[] = [];
      while (i < lines.length && (/^ {4,}/.test(lines[i]!) || lines[i]!.trim() === "")) {
        if (lines[i]!.trim() === "" && !(i + 1 < lines.length && /^ {4,}/.test(lines[i + 1]!))) break;
        code.push(lines[i]!.slice(4));
        i++;
      }
      while (code.length > 0 && code[code.length - 1]!.trim() === "") code.pop();
      blocks.push(<pre key={key++} className="code">{code.join("\n")}</pre>);
      continue;
    }
    const para: string[] = [];
    while (i < lines.length && lines[i]!.trim() !== "" && !/^ {4,}/.test(lines[i]!)) { para.push(lines[i]!.trim()); i++; }
    blocks.push(<p key={key++}>{renderInline(para.join(" "))}</p>);
  }
  return <>{blocks}</>;
}
```

- [ ] **Step 3:** `WatchStepView`: `<div className="body"><TinyMarkdown text={step.body} /></div>`.
- [ ] **Step 4:** Tests green (incl. existing stepViews tests — fix any that assert raw body text node shape). Commit `feat(client): watch-step tiny-markdown body rendering`.

### Task 7: Input placeholders

**Files:**
- Modify: `packages/client/src/steps/PredictStepView.tsx` (free-text input: `placeholder="Type exactly what gets printed…"`)
- Modify: `packages/client/src/steps/RecallStepView.tsx` (`placeholder="Type your answer…"`)
- Test: extend `packages/client/test/stepViews.test.tsx`

- [ ] **Step 1:** Failing assertions on the placeholder attributes; implement; green. Commit `feat(client): step input placeholder copy`.

### Task 8: TrellisApp app-state wrappers + warming gate

**Files:**
- Modify: `packages/client/src/app/TrellisApp.tsx`
- Modify: `packages/client/src/app/main.tsx` (pass `warmup`)
- Test: `packages/client/test/trellisApp.test.tsx` (new)

- [ ] **Step 1:** Failing tests using `memoryDriver()` + injected `fetchImpl` (serves a minimal valid bundle): loading wrapper `.app-state.app-loading` with `.app-status` "Loading…"; warming state `.app-state.app-warming` shows "Getting Python ready…", `.warm-bar > i`, and the `.app-sub` copy while an injected `warmup` promise is pending, then the runner mounts on resolve; error state keeps `role="alert"`, gains `.app-error`, headline "Couldn't load this lesson", reassurance copy, and the existing `Failed to load: {message}` demoted into `<code>`.
- [ ] **Step 2:** Implement — add optional injectables (additive, defaults preserve production behavior):

```tsx
export interface TrellisAppProps {
  bundleUrl: string;
  contentVersion: string;
  cellId: string;
  sandbox: BuildSandbox;
  warmup?: () => Promise<void>;   // ManagedSandbox.warmup — gates the app-warming state
  driver?: IdbDriver;             // test seam; defaults to nativeDriver()
  fetchImpl?: typeof fetch;       // test seam
}
```

State: `ready` (content+db), `warm` (boolean, starts `warmup === undefined`). Kick off content load and `warmup()` concurrently in the effect; `warmup().then(() => setWarm(true), () => setWarm(true))` (a warmup failure is surfaced later by the run path — never strand the learner in warming). Render:

```tsx
if (err !== null) return (
  <div className="app-state">
    <div role="alert" className="app-error">
      <div className="app-status">Couldn't load this lesson</div>
      <p className="app-sub">Your progress is safe on this device. Check your connection and reload the page.</p>
      <p><code>Failed to load: {err}</code></p>
    </div>
  </div>
);
if (ready === null) return (
  <div className="app-state app-loading"><div className="app-status">Loading…</div></div>
);
if (!warm) return (
  <div className="app-state app-warming">
    <div className="app-status">Getting Python ready…</div>
    <div className="warm-bar"><i /></div>
    <div className="app-sub">First visit takes a few seconds. After this, checking your code is instant.</div>
  </div>
);
```

(No spinner anywhere; the warm-bar is the CSS-animated bar with the reduced-motion fallback already in trellis-ui.css.)
- [ ] **Step 3:** `main.tsx` passes `warmup={() => sandbox.warmup()}` (makeBrowserSandbox returns ManagedSandbox — change its return type or call-site accordingly).
- [ ] **Step 4:** Tests green. Commit `feat(client): app-state wrappers incl. Getting-Python-ready warming gate`.

### Task 9: EditorPane theme wiring + lockedRegions styling contract

**Files:**
- Modify: `packages/client/src/editor/EditorPane.tsx` (`...trellisEditor` in extensions)
- Modify: `packages/client/src/editor/lockedRegions.ts` (add `cm-lockedLine` line decorations + `cm-lockedGutter` lineNumber gutter markers)
- Test: `packages/client/test/lockedRegions.test.ts` + `packages/client/test/editorPane.test.tsx`

- [ ] **Step 1:** Failing test: an EditorView with `lockedRegionsExtension([{startLine:1,endLine:2}])` over a 3-line doc has exactly 2 `.cm-lockedLine` lines and `.cm-lockedGutter` markers on those lines' gutter elements; line 3 has neither; the changeFilter behavior tests stay untouched and green (silent rejection — no shake/toast).
- [ ] **Step 2:** Extend `lockedRegionsExtension` (behavior untouched — the transactionFilter stays exactly as-is; this only ADDS the styling contract from the theme file's bottom block):

```ts
import { Decoration, EditorView, GutterMarker, lineNumberMarkers } from "@codemirror/view";
import { RangeSetBuilder, RangeSet } from "@codemirror/state";

class LockedGutterMarker extends GutterMarker {
  toDOM(): Node {
    return Object.assign(document.createElement("span"), { className: "cm-lockedGutter" });
  }
}
const lockedGutterMarker = new LockedGutterMarker();
const lockedLine = Decoration.line({ class: "cm-lockedLine" });

function lockedLineStarts(state: EditorState, ranges: readonly LineRange[]): number[] { /* clamp to doc.lines, dedupe, sorted */ }
```

and compose: `[transactionFilter, EditorView.decorations.compute(["doc"], buildLineDecos), lineNumberMarkers.compute(["doc"], buildGutterSet)]`.
- [ ] **Step 3:** Tests green. Commit `feat(client): trellisEditor theme + lockedRegions visual contract (cm-lockedLine/cm-lockedGutter)`.

### Task 10: Real static build (esbuild), workerUrl fix, fonts, index.html

**Files:**
- Create: `packages/client/scripts/build-app.mjs`
- Modify: `packages/client/package.json` (deps + `build` script)
- Modify: `packages/client/src/app/main.tsx` (CSS+font imports, module-relative bundleUrl, build-time contentVersion)
- Modify: `packages/client/src/app/makeSandbox.ts` (workerUrl `./pyodide-worker.js` relative to bundle)
- Modify: `packages/client/index.html` (built assets)

- [ ] **Step 1:** Add to client `package.json`: dependencies `@fontsource/baloo-2`, `@fontsource/nunito-sans`, `@fontsource/jetbrains-mono` (`^5.x`); devDependencies `esbuild` (`^0.25.x`), `@trellis/authoring": "workspace:*"` (orders the authoring CLI build before the client app build under turbo). `"build": "tsc -p tsconfig.json && node scripts/build-app.mjs"`. Run `pnpm install`.
- [ ] **Step 2:** `main.tsx`:

```tsx
import "@fontsource/nunito-sans/400.css";
import "@fontsource/nunito-sans/600.css";
import "@fontsource/nunito-sans/800.css";
import "@fontsource/baloo-2/700.css";
import "@fontsource/jetbrains-mono/400.css";
import "@fontsource/jetbrains-mono/500.css";
import "@fontsource/jetbrains-mono/700.css";
import "../styles/trellis-tokens.css";
import "../styles/trellis-ui.css";
...
declare const __TRELLIS_CONTENT_VERSION__: string | undefined;
const contentVersion = typeof __TRELLIS_CONTENT_VERSION__ === "string" ? __TRELLIS_CONTENT_VERSION__ : "";
const sandbox = makeBrowserSandbox();
root.render(
  <TrellisApp
    bundleUrl={new URL("./bundle.json", import.meta.url).href}
    contentVersion={contentVersion}
    cellId="cell.string_concat.text_plus_number"
    sandbox={sandbox}
    warmup={() => sandbox.warmup()}
  />,
);
```

- [ ] **Step 3:** `makeSandbox.ts`: `const workerUrl = new URL("./pyodide-worker.js", import.meta.url);` — resolves against the SERVED bundle location (`dist/app/main.js` → sibling `dist/app/pyodide-worker.js`). Return type `ManagedSandbox`.
- [ ] **Step 4:** `scripts/build-app.mjs`:

```js
// Static app build (M5 contract: bootable from `python -m http.server`, no server logic).
// 1. bundle.json via the authoring CLI; 2. main bundle (app + CSS + woff2 assets);
// 3. the Pyodide worker as a SEPARATE module file (new Worker(url, {type:"module"}));
// 4. assert zero node: specifiers in the browser outputs.
import { build } from "esbuild";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const pkgRoot = fileURLToPath(new URL("..", import.meta.url));
const outDir = path.join(pkgRoot, "dist/app");
mkdirSync(outDir, { recursive: true });

execFileSync("node", [
  path.join(pkgRoot, "../authoring/dist/src/cli.js"),
  "build", "--out", path.join(outDir, "bundle.json"), "--content", path.join(pkgRoot, "../../content"),
], { stdio: "inherit" });
const contentVersion = JSON.parse(readFileSync(path.join(outDir, "bundle.json"), "utf8")).contentVersion;

const common = {
  bundle: true, format: "esm", platform: "browser", sourcemap: true,
  logLevel: "info",
  define: { "process.env.NODE_ENV": '"production"', __TRELLIS_CONTENT_VERSION__: JSON.stringify(contentVersion) },
};
await build({
  ...common,
  entryPoints: [path.join(pkgRoot, "src/app/main.tsx")],
  outdir: outDir, jsx: "automatic",
  loader: { ".woff2": "file", ".woff": "file" },
  assetNames: "assets/[name]-[hash]",
});
await build({
  ...common,
  entryPoints: [path.join(pkgRoot, "node_modules/@trellis/sandbox/src/pyodide-worker.ts")],
  outfile: path.join(outDir, "pyodide-worker.js"),
});

for (const f of readdirSync(outDir)) {
  if (!f.endsWith(".js")) continue;
  const src = readFileSync(path.join(outDir, f), "utf8");
  if (/["']node:/.test(src)) throw new Error(`browser bundle ${f} contains a node: specifier`);
}
console.log(`static app built → ${outDir} (contentVersion ${contentVersion})`);
```

- [ ] **Step 5:** `index.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Trellis</title>
    <link rel="stylesheet" href="./dist/app/main.css" />
  </head>
  <body>
    <div id="root"></div>
    <!-- Static esbuild output (scripts/build-app.mjs). Served via `python -m http.server`
         from the repo root: http://localhost:8000/packages/client/index.html -->
    <script type="module" src="./dist/app/main.js"></script>
  </body>
</html>
```

- [ ] **Step 6:** `pnpm --filter @trellis/client build` → dist/app/{main.js,main.css,pyodide-worker.js,bundle.json,assets/*.woff2}; node:-specifier grep inside the script passes. Commit `feat(client): real esbuild static host (browser-safe graph, worker module, self-hosted fonts)`.

### Task 11: Full workspace gates

- [ ] **Step 1:** `pnpm -r typecheck && pnpm -r lint && pnpm -r test && pnpm -r build` → all green (392+ tests incl. 42+ client).
- [ ] **Step 2:** `node packages/client/test/esm-probe.mjs` → OK.
- [ ] **Step 3:** Commit anything outstanding.

### Task 12: THE gate — serve built app, real-browser walkthrough, screenshots

**Files:**
- Delete: `verification/app/` (sanctioned — stale repro bundle)
- Modify: `verification/run-debt5.mjs` (serve target → `/packages/client/index.html`; attribution-color probes → border/background, since the Greenhouse band colors via `--fb-*` not element `color`)

- [ ] **Step 1:** `rm -rf verification/app`; update `run-debt5.mjs` goto URL and the two color probes to `getComputedStyle(el).borderColor` (+ keep asserting misconception ≠ pass).
- [ ] **Step 2:** From repo root: `python3 -m http.server 8765` (background), then `cd verification && npm ci || npm install && node run-debt5.mjs` → 9/9 green against the REAL built app with Greenhouse styling.
- [ ] **Step 3:** Screenshots (Playwright or Preview) of: warming state, watch step (styled), misconception feedback + hint ladder, error feedback (submit `print(` syntax error or a runtime error), pass + cell complete. Save under `verification/evidence/` and eyeball vs `docs/design/greenhouse/design/Cell Runner.html` artboards.
- [ ] **Step 4:** `grep -rn "node:" packages/client/dist/app/*.js` → no matches (paste output).
- [ ] **Step 5:** Commit `test(verification): run-debt5 against the real static host; drop stale repro app`.

### Task 13: Scope check, rebase, report

- [ ] **Step 1:** `git diff main...HEAD --stat` → only `packages/client/**`, `packages/sandbox/{package.json,src/index.browser.ts}`, `verification/**`, `pnpm-lock.yaml`, `docs/superpowers/plans/**`.
- [ ] **Step 2:** `git fetch . && git rebase main` if main moved (it's a local worktree — check `git log main..HEAD` / `git log HEAD..main`).
- [ ] **Step 3:** Final report to the orchestrator (gates output pasted, screenshots listed, escalations if any). Do NOT merge.

---

**Known judgment calls (report these):**
- The handback's "optional output strip" for watch-step indented code: the corpus has no output-strip syntax; indented code renders as the terrarium `pre.code` block (the strip stays a CSS-only affordance until content grows a syntax for it).
- `TrellisAppProps` gains optional `warmup`/`driver`/`fetchImpl` injectables (additive; production defaults unchanged) — required to test app states without real IndexedDB.
- run-debt5 color probes move from `color` to `borderColor` because Greenhouse colors the band via surface/border/ink variables, not element `color`.
