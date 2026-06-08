import { describe, it, expect } from "vitest";
import { parsePython, runCase } from "../src/ast/python.js";

describe("python bridge", () => {
  it("parses code to a JSON AST", () => {
    const p = parsePython("print('hi')");
    expect(p.syntaxError).toBe(false);
    if (!p.syntaxError) expect(p.ast._type).toBe("Module");
  });
  it("reports syntax errors", () => {
    const p = parsePython("def f(:\n  pass");
    expect(p.syntaxError).toBe(true);
  });
  it("runs a passing stdin case", () => {
    const r = runCase({ code: "print('Hi Alan!')", mode: "stdin", expected: "Hi Alan!\n", stdin: null });
    expect(r).toEqual({ ran: true, errType: null, ok: true });
  });
  it("runs a passing entrypoint case", () => {
    const r = runCase({ code: "def greet(n):\n return 'Hi ' + n + '!'", mode: "entrypoint", entry: "greet", args: ["Alan"], expected: "Hi Alan!" });
    expect(r).toEqual({ ran: true, errType: null, ok: true });
  });
  it("detects a runtime error", () => {
    const r = runCase({ code: "def f(x):\n return 'a' + x", mode: "entrypoint", entry: "f", args: [7], expected: "a7" });
    expect(r.errType).toBe("runtime");
    expect(r.ok).toBe(false);
  });
});
