import { PINNED_PYODIDE_URL } from "@trellis/sandbox";
import type { AstQuery } from "@trellis/schema";
import type {
  MainThreadPyodide,
  PyodideLoader,
  AssetSpec,
  RunOutcome,
  StallEvent,
} from "./types.js";
import { createGameGen, type GameGen } from "./game-gen.js";
import { createWatchdog, type Watchdog, type WatchdogOpts } from "./watchdog.js";
import { precheckSource } from "./precheck.js";

export interface PygameRuntimeOpts {
  /** Injected; prod = dynamic import of the pinned CDN module, tests = fake. */
  loadPyodide: PyodideLoader;
  /** The WORKER's parseAndMatch (ast.parse only, off the main thread). */
  parseAndMatch: (
    code: string,
    q: { tag: string; query: AstQuery }[],
  ) => Promise<string[]>;
  /** Default PINNED_PYODIDE_URL — one pin, shared with the grading worker. */
  pyodideUrl?: string;
  /** Default globalThis — Python reads window.gameGen (§17.3). */
  genTarget?: Record<string, unknown>;
  watchdog?: WatchdogOpts;
  /** Client shows the non-modal Reset affordance. */
  onStall?: (e: StallEvent) => void;
}

export interface PygameRuntime {
  /** §17.2 boot steps 1–4: pyodide → canvas registration → pygame-ce wheel → assets. */
  boot(canvas: HTMLCanvasElement, assets?: AssetSpec[]): Promise<void>;
  /** bump gen → precheck → runPythonAsync. Errors come back as RunOutcome, never throw. */
  start(source: string): Promise<RunOutcome>;
  /** Alias of start — the gen bump retires the old loop; no explicit stop needed. */
  restart(source: string): Promise<RunOutcome>;
  /** Bump only — the running loop exits on its next frame (§17.3). */
  stop(): void;
  /** stop + watchdog off (unmount path). */
  dispose(): void;
}

export function createPygameRuntime(opts: PygameRuntimeOpts): PygameRuntime {
  const gen: GameGen = createGameGen(opts.genTarget ?? (globalThis as never));
  const watchdog: Watchdog = createWatchdog(opts.watchdog ?? {});
  const onStall = opts.onStall ?? (() => {});
  let py: MainThreadPyodide | null = null;
  let watchdogArmed = false;

  function armWatchdog(): void {
    if (watchdogArmed) return;
    watchdogArmed = true;
    watchdog.start(onStall);
  }
  function disarmWatchdog(): void {
    if (!watchdogArmed) return;
    watchdogArmed = false;
    watchdog.stop();
  }

  async function boot(canvas: HTMLCanvasElement, assets: AssetSpec[] = []): Promise<void> {
    if (py === null) {
      // §17.2 step 1+2: load pyodide, register the canvas BEFORE pygame imports —
      // SDL resolves its render target at import/display-creation time.
      const instance = await opts.loadPyodide({
        indexURL: opts.pyodideUrl ?? PINNED_PYODIDE_URL,
      });
      if (instance.canvas?.setCanvas2D) {
        instance.canvas.setCanvas2D(canvas);
      } else if (instance._module) {
        // §17.8 documented fallback when the canvas API surface differs.
        instance._module.keyboardListeningElement = canvas;
      }
      // step 3: the pygame-ce wheel (lazy — only pygame steps ever boot this runtime).
      await instance.loadPackage("pygame-ce");
      py = instance;
    }
    // step 4: assets land on the FS before the game reads them. Re-booting with new
    // assets re-writes them (idempotent writes; loadPyodide runs at most once).
    const dirs = new Set<string>();
    for (const a of assets) {
      const dir = a.path.slice(0, a.path.lastIndexOf("/"));
      if (dir && !dirs.has(dir)) {
        dirs.add(dir);
        py.FS.mkdirTree(dir);
      }
      py.FS.writeFile(a.path, a.data);
    }
  }

  async function start(source: string): Promise<RunOutcome> {
    if (py === null) return { ok: false, error: "runtime not booted" };
    // The bump retires any previous loop (it re-reads window.gameGen each frame).
    gen.bump();
    const pre = await precheckSource(source, opts.parseAndMatch);
    if (!pre.ok) return { ok: false, refusal: pre.refusal };
    armWatchdog();
    try {
      await py.runPythonAsync(source);
      return { ok: true };
    } catch (e) {
      // The SyntaxError path the precheck deliberately passes through lands here.
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  }

  return {
    boot,
    start,
    restart: start,
    stop() {
      gen.bump();
      disarmWatchdog();
    },
    dispose() {
      gen.bump();
      disarmWatchdog();
    },
  };
}
