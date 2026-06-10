import { describe, it, expect, vi } from "vitest";
import { PINNED_PYODIDE_URL } from "@trellis/sandbox";
import { makePygameRuntime } from "../src/app/makePygameRuntime.js";

function fakePyodideModule() {
  const ops: string[] = [];
  const loadPyodide = vi.fn(async (_o: { indexURL: string }) => ({
    canvas: { setCanvas2D: () => ops.push("setCanvas2D") },
    loadPackage: async (n: string) => {
      ops.push(`loadPackage:${n}`);
    },
    runPythonAsync: async (src: string) => {
      ops.push(`run:${src}`);
      return undefined;
    },
    FS: { writeFile: () => {}, mkdirTree: () => {} },
  }));
  return { loadPyodide, ops };
}

describe("makePygameRuntime (§17.7 — lazy main-thread Pyodide)", () => {
  it("imports {PINNED}pyodide.mjs lazily at boot and passes the pinned indexURL", async () => {
    const mod = fakePyodideModule();
    const importer = vi.fn(async (_spec: string) => mod);
    const sandbox = { parseAndMatch: vi.fn(async () => [] as string[]) };
    const rt = makePygameRuntime(sandbox, { importer, genTarget: {} });
    expect(importer).not.toHaveBeenCalled(); // creation costs nothing
    await rt.boot({ id: "canvas" } as unknown as HTMLCanvasElement);
    expect(importer).toHaveBeenCalledWith(`${PINNED_PYODIDE_URL}pyodide.mjs`);
    expect(mod.loadPyodide).toHaveBeenCalledWith({ indexURL: PINNED_PYODIDE_URL });
    expect(mod.ops).toContain("setCanvas2D");
    expect(mod.ops).toContain("loadPackage:pygame-ce");
  });

  it("parseAndMatch IS the sandbox's (the precheck runs through the worker)", async () => {
    const mod = fakePyodideModule();
    const sandbox = { parseAndMatch: vi.fn(async () => ["awaitless_loop"]) };
    const rt = makePygameRuntime(sandbox, { importer: async () => mod, genTarget: {} });
    await rt.boot({ id: "canvas" } as unknown as HTMLCanvasElement);
    const r = await rt.start("while True:\n    pass");
    expect(sandbox.parseAndMatch).toHaveBeenCalledOnce();
    expect(r.ok).toBe(false);
    expect(r.refusal).toMatch(/never yields/);
  });
});
