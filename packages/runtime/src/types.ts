// The narrow main-thread Pyodide surface the runtime drives. Mirrors the worker's
// PyodideLike narrowing (packages/sandbox/src/pyodide-worker.ts); fakes implement
// this in tests.
export interface MainThreadPyodide {
  canvas?: { setCanvas2D(el: HTMLCanvasElement): void };
  loadPackage(name: string): Promise<void>;
  runPythonAsync(code: string): Promise<unknown>;
  FS: { writeFile(path: string, data: Uint8Array): void; mkdirTree(path: string): void };
  // §17.8 fallback for Pyodide builds where the canvas API surface differs.
  _module?: { keyboardListeningElement?: unknown };
}
export type PyodideLoader = (opts: { indexURL: string }) => Promise<MainThreadPyodide>;

export interface AssetSpec {
  path: string;
  data: Uint8Array;
}
export interface RunOutcome {
  ok: boolean;
  refusal?: string;
  error?: string;
}
export interface StallEvent {
  blownBudgetMs: number;
  consecutive: number;
}
