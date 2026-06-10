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
export { createGameGen } from "./game-gen.js";
export type { GameGen } from "./game-gen.js";
export { createWatchdog } from "./watchdog.js";
export type { Watchdog, WatchdogOpts } from "./watchdog.js";
export { precheckSource, AWAITLESS_LOOP_QUERIES, REFUSAL_MESSAGE } from "./precheck.js";
export type { PrecheckResult } from "./precheck.js";
export { createPygameRuntime } from "./pygame-runtime.js";
export type { PygameRuntime, PygameRuntimeOpts } from "./pygame-runtime.js";
