// @trellis/runtime — the main-thread pygame *player* (§17.2/§17.3). An adapter like
// sandbox/persist: the engine stays pure and never imports this. Grading NEVER happens
// here — submissions are graded headlessly in the worker (packages/sandbox/graphical).
export type {
  MainThreadPyodide,
  PyodideLoader,
  AssetSpec,
  RunOutcome,
  StallEvent,
} from "./types.js";
