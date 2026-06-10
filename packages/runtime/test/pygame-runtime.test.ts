import { describe, it, expect } from "vitest";
import { createPygameRuntime } from "../src/pygame-runtime.js";
import { REFUSAL_MESSAGE } from "../src/precheck.js";
import { makeFakePyodide, makeLoader } from "./fake-pyodide.js";
import type { StallEvent } from "../src/types.js";

const okPrecheck = async () => [] as string[];
const refusing = async () => ["awaitless_loop"];
const canvasEl = { id: "canvas" } as unknown as HTMLCanvasElement;

function watchdogSpy(log: string[]) {
  // fake raf/caf that records bracket calls; never fires frames.
  return {
    raf: (() => {
      log.push("watchdog:start-frame");
      return 1;
    }) as (cb: FrameRequestCallback) => number,
    caf: () => {
      log.push("watchdog:caf");
    },
  };
}

describe("createPygameRuntime lifecycle (§17.3)", () => {
  it("start(src) bumps gameGen then runs src; restart(src2) bumps again and runs src2 (no stop needed — the bump IS the stop)", async () => {
    const fake = makeFakePyodide();
    const { loader } = makeLoader(fake);
    const target: Record<string, unknown> = {};
    const rt = createPygameRuntime({
      loadPyodide: loader,
      parseAndMatch: okPrecheck,
      genTarget: target,
      watchdog: { raf: () => 0, caf: () => {} },
    });
    await rt.boot(canvasEl);
    const r1 = await rt.start("SRC1");
    expect(r1.ok).toBe(true);
    expect(target["gameGen"]).toBe(1);
    expect(fake.sources).toEqual(["SRC1"]);
    const r2 = await rt.restart("SRC2");
    expect(r2.ok).toBe(true);
    expect(target["gameGen"]).toBe(2);
    expect(fake.sources).toEqual(["SRC1", "SRC2"]);
  });

  it("stop() bumps and runs nothing", async () => {
    const fake = makeFakePyodide();
    const { loader } = makeLoader(fake);
    const target: Record<string, unknown> = {};
    const rt = createPygameRuntime({
      loadPyodide: loader,
      parseAndMatch: okPrecheck,
      genTarget: target,
      watchdog: { raf: () => 0, caf: () => {} },
    });
    await rt.boot(canvasEl);
    await rt.start("SRC");
    const runsBefore = fake.sources.length;
    rt.stop();
    expect(target["gameGen"]).toBe(2);
    expect(fake.sources.length).toBe(runsBefore);
  });

  it("start REFUSES via the precheck — runPythonAsync never sees the source", async () => {
    const fake = makeFakePyodide();
    const { loader } = makeLoader(fake);
    const rt = createPygameRuntime({
      loadPyodide: loader,
      parseAndMatch: refusing,
      genTarget: {},
      watchdog: { raf: () => 0, caf: () => {} },
    });
    await rt.boot(canvasEl);
    const r = await rt.start("while True:\n    pass");
    expect(r.ok).toBe(false);
    expect(r.refusal).toBe(REFUSAL_MESSAGE);
    expect(fake.ops.filter((o) => o === "runPythonAsync")).toEqual([]);
  });

  it("a runPythonAsync throw becomes { ok:false, error } — never a throw across the React boundary", async () => {
    const fake = makeFakePyodide();
    fake.runPythonAsync = async () => {
      throw new Error("SyntaxError: invalid syntax");
    };
    const { loader } = makeLoader(fake);
    const rt = createPygameRuntime({
      loadPyodide: loader,
      parseAndMatch: okPrecheck,
      genTarget: {},
      watchdog: { raf: () => 0, caf: () => {} },
    });
    await rt.boot(canvasEl);
    const r = await rt.start("def f(:");
    expect(r.ok).toBe(false);
    expect(r.error).toContain("SyntaxError");
  });

  it("watchdog brackets play: start arms it, dispose() stops it and bumps the gen", async () => {
    const fake = makeFakePyodide();
    const { loader } = makeLoader(fake);
    const log: string[] = [];
    const target: Record<string, unknown> = {};
    const rt = createPygameRuntime({
      loadPyodide: loader,
      parseAndMatch: okPrecheck,
      genTarget: target,
      watchdog: watchdogSpy(log),
    });
    await rt.boot(canvasEl);
    await rt.start("SRC");
    expect(log).toContain("watchdog:start-frame");
    rt.dispose();
    expect(log).toContain("watchdog:caf");
    expect(target["gameGen"]).toBe(2);
  });

  it("a stall reaches onStall", async () => {
    const fake = makeFakePyodide();
    const { loader } = makeLoader(fake);
    const stalls: StallEvent[] = [];
    let cb: FrameRequestCallback | null = null;
    const rt = createPygameRuntime({
      loadPyodide: loader,
      parseAndMatch: okPrecheck,
      genTarget: {},
      watchdog: {
        budgetMs: 100,
        consecutive: 1,
        raf: (f) => {
          cb = f;
          return 1;
        },
        caf: () => {},
      },
      onStall: (e) => stalls.push(e),
    });
    await rt.boot(canvasEl);
    await rt.start("SRC");
    // drive two frames with a blown gap
    cb!(0);
    cb!(500);
    expect(stalls.length).toBe(1);
  });
});
