import { describe, it, expect } from "vitest";
import { entrypointDriver, parseDriverStdout, SENTINEL } from "../src/pyDriver.js";

describe("entrypointDriver", () => {
  it("embeds the learner code and emits a base64 args decode + sentinel print", () => {
    const prog = entrypointDriver({ code: "def greet(name):\n    return 'Hi ' + name", entrypoint: "greet", args: ["Alan"] });
    expect(prog).toContain("def greet(name)");
    expect(prog).toContain("b64decode");
    expect(prog).toContain("greet(*");
    expect(prog).toContain(SENTINEL);
    expect(prog).not.toContain("_sd.seed"); // no seed → no seeding line
  });
  it("includes seeding when a seed is provided", () => {
    const prog = entrypointDriver({ code: "x=1", entrypoint: "f", args: [1, 2], seed: 1234 });
    expect(prog).toContain("import random as _sd");
    expect(prog).toContain("_sd.seed(1234)");
  });
});

describe("parseDriverStdout", () => {
  it("extracts the JSON after the sentinel and ignores preceding output", () => {
    const out = `some learner print\n${SENTINEL}{"v": 42}`;
    expect(parseDriverStdout(out)).toEqual({ ok: true, value: 42 });
  });
  it("reports failure when the sentinel is absent", () => {
    expect(parseDriverStdout("no sentinel here")).toEqual({ ok: false });
  });
});
