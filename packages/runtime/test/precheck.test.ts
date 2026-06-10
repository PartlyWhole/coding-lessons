import { describe, it, expect } from "vitest";
import { createLocalSandbox } from "@trellis/sandbox";
import { precheckSource, AWAITLESS_LOOP_QUERIES, REFUSAL_MESSAGE } from "../src/precheck.js";

// Drive with the REAL query against the offline CPython twin (mutation-style goldens):
// parseAndMatch only ast.parses — never executes — so it is safe on any source.
const local = createLocalSandbox();
const pm = (code: string, q: Parameters<typeof local.parseAndMatch>[1]) =>
  local.parseAndMatch(code, q);

describe("await-less loop pre-check (§17.5 guard 1)", () => {
  it("REFUSES a while-loop with no await (the tab-freezing hazard)", async () => {
    const r = await precheckSource("while True:\n    x = 1\n", pm);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.refusal).toBe(REFUSAL_MESSAGE);
  });
  it("ALLOWS the §17.3 contract loop (await asyncio.sleep inside)", async () => {
    const src =
      "import asyncio\nasync def main():\n    while True:\n        await asyncio.sleep(1/60)\n";
    expect((await precheckSource(src, pm)).ok).toBe(true);
  });
  it("REFUSES an await-less while nested inside the async scaffold (mutation golden)", async () => {
    const src =
      "import asyncio\nasync def main():\n    while True:\n        await asyncio.sleep(1/60)\n        while x < 10:\n            x += 1\n";
    expect((await precheckSource(src, pm)).ok).toBe(false);
  });
  it("ALLOWS for-loops without await (bounded iteration is not the hazard)", async () => {
    expect((await precheckSource("for i in range(3):\n    print(i)\n", pm)).ok).toBe(true);
  });
  it("passes through on a syntax error (parseAndMatch yields []; the runtime surfaces the real SyntaxError at run)", async () => {
    expect((await precheckSource("while True\n  oops", pm)).ok).toBe(true);
  });
});
