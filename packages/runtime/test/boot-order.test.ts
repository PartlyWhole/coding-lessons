import { describe, it, expect } from "vitest";
import { PINNED_PYODIDE_URL } from "@trellis/sandbox";
import { createPygameRuntime } from "../src/pygame-runtime.js";
import { makeFakePyodide, makeLoader } from "./fake-pyodide.js";

const okPrecheck = async () => [] as string[];
const canvasEl = { id: "canvas" } as unknown as HTMLCanvasElement;
const noRaf = { raf: () => 0, caf: () => {} };

describe("boot ordering (§17.2 — load-bearing)", () => {
  it("setCanvas2D BEFORE loadPackage(pygame-ce) BEFORE asset writes BEFORE first runPythonAsync", async () => {
    const fake = makeFakePyodide();
    const { loader } = makeLoader(fake);
    const rt = createPygameRuntime({
      loadPyodide: loader,
      parseAndMatch: okPrecheck,
      genTarget: {},
      watchdog: noRaf,
    });
    await rt.boot(canvasEl, [{ path: "/assets/x.png", data: new Uint8Array([1]) }]);
    await rt.start("print('hi')");
    expect(fake.ops).toEqual([
      "loadPyodide",
      "setCanvas2D",
      "loadPackage:pygame-ce",
      "mkdirTree:/assets",
      "writeFile:/assets/x.png",
      "runPythonAsync",
    ]);
  });

  it("loadPyodide is called with the SHARED pinned CDN url", async () => {
    const fake = makeFakePyodide();
    const { loader, calls } = makeLoader(fake);
    const rt = createPygameRuntime({
      loadPyodide: loader,
      parseAndMatch: okPrecheck,
      genTarget: {},
      watchdog: noRaf,
    });
    await rt.boot(canvasEl);
    expect(calls).toEqual([{ indexURL: PINNED_PYODIDE_URL }]);
  });

  it("falls back to _module.keyboardListeningElement when the canvas API is absent (§17.8)", async () => {
    const fake = makeFakePyodide({ withCanvasApi: false });
    const { loader } = makeLoader(fake);
    const rt = createPygameRuntime({
      loadPyodide: loader,
      parseAndMatch: okPrecheck,
      genTarget: {},
      watchdog: noRaf,
    });
    await rt.boot(canvasEl);
    expect(fake.module.keyboardListeningElement).toBe(canvasEl);
  });

  it("boot is idempotent — a second boot reuses the instance (no second loadPyodide)", async () => {
    const fake = makeFakePyodide();
    const { loader, calls } = makeLoader(fake);
    const rt = createPygameRuntime({
      loadPyodide: loader,
      parseAndMatch: okPrecheck,
      genTarget: {},
      watchdog: noRaf,
    });
    await rt.boot(canvasEl);
    await rt.boot(canvasEl);
    expect(calls.length).toBe(1);
  });
});
