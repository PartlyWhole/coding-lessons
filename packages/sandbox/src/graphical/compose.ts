import type { GraphicalConfig } from "./types.js";

// D3 — everything from this marker down is harness, NEVER learner source. The
// graphical decorator strips from here before parseAndMatch so AST tags are computed
// over the learner's code only (the harness references pygame K_* names and would
// otherwise defeat negative queries).
export const APPENDIX_MARKER = "# === TRELLIS GRAPHICAL HARNESS (auto) ===";

// D3 — EXACTLY ONE LINE (the decorator re-maps error.line by -1). Sets the SDL dummy
// drivers and the TRELLIS_HEADLESS contract flag the locked preamble gates on (design
// note 2026-06-10-pygame-headless-preamble.md): the grading wrapper MUST set it, the
// main-thread runtime MUST NOT.
export const HEADLESS_PREFIX =
  'import os; os.environ["SDL_VIDEODRIVER"]="dummy"; os.environ["SDL_AUDIODRIVER"]="dummy"; os.environ["TRELLIS_HEADLESS"]="1"; os.environ.setdefault("PYGAME_HIDE_SUPPORT_PROMPT","1")\n';

function toBase64Json(value: unknown): string {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

// The Python appendix implementing D1 (one synthesized entrypoint serves tests AND
// property) and D4 (edge-triggered KEYDOWN/KEYUP from per-frame key-state diffs, one
// MOUSEMOTION per mouse entry). pygame is imported lazily and ONLY when a frame
// actually synthesizes an event, so keyless tapes grade without the wheel.
function appendix(g: GraphicalConfig, seed: number): string {
  const init = g.entrypoints.init;
  const probe = g.entrypoints.probe;
  const update = g.entrypoints.update;
  const tapeB64 = toBase64Json(g.inputTape);
  return [
    "",
    APPENDIX_MARKER,
    "import json as __tg_json, base64 as __tg_b64",
    `__TG_TAPE = __tg_json.loads(__tg_b64.b64decode("${tapeB64}").decode("utf-8"))`,
    `__TG_DT = ${String(g.dt)}`,
    `__TG_FRAMES = ${String(g.frames)}`,
    `__TG_SEED = ${String(seed)}`,
    "",
    "def __trellis_events(__i, __prev_keys):",
    "    __frame = __TG_TAPE[__i] if __i < len(__TG_TAPE) else {}",
    '    __keys = __frame.get("keysDown") or []',
    '    __mouse = __frame.get("mouse")',
    "    if not __keys and not __prev_keys and __mouse is None:",
    "        return [], __keys",
    "    import os as __tg_os",
    '    __tg_os.environ.setdefault("PYGAME_HIDE_SUPPORT_PROMPT", "1")',
    "    import pygame as __tg_pg",
    "    __evts = []",
    "    for __k in __keys:",
    "        if __k not in __prev_keys:",
    "            __evts.append(__tg_pg.event.Event(__tg_pg.KEYDOWN, key=getattr(__tg_pg, __k)))",
    "    for __k in __prev_keys:",
    "        if __k not in __keys:",
    "            __evts.append(__tg_pg.event.Event(__tg_pg.KEYUP, key=getattr(__tg_pg, __k)))",
    "    if __mouse is not None:",
    '        __evts.append(__tg_pg.event.Event(__tg_pg.MOUSEMOTION, pos=(__mouse["x"], __mouse["y"]), buttons=__mouse["buttons"]))',
    "    return __evts, __keys",
    "",
    "def __trellis_sim(__frame, *__init_args):",
    "    import random as __tg_rnd",
    "    __tg_rnd.seed(__TG_SEED)",
    `    __state = ${init !== undefined ? `${init}(*__init_args)` : "None"}`,
    "    __prev = []",
    "    for __i in range(__frame):",
    "        __evts, __prev = __trellis_events(__i, __prev)",
    `        __state = ${update}(__state, __evts, __TG_DT)`,
    `    return ${probe !== undefined ? `${probe}(__state)` : "__state"}`,
    "",
  ].join("\n");
}

// learner source verbatim FIRST (line numbers preserved for error mapping), then the
// deterministic simulation driver.
export function composeHeadlessSource(
  g: GraphicalConfig,
  learnerSource: string,
  seed: number,
): string {
  return learnerSource + "\n" + appendix(g, seed);
}

// The same appendix over the REFERENCE init/update/probe, plus the `sol` alias the
// frozen propertyRunner calls on the oracle program (see engine/propertyRunner.ts).
export function composeReferenceSource(
  g: GraphicalConfig,
  referenceSource: string,
  seed: number,
): string {
  return referenceSource + "\n" + appendix(g, seed) + "\nsol = __trellis_sim\n";
}
