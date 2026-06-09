import { describe, it, expect } from "vitest";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { loadContent } from "../src/load.js";
import { gateFixtures } from "../src/gates/fixtures.js";

const ROOT = resolve(__dirname, "../../..");

describe("gate 5 differential oracle (TS port vs harness.py)", () => {
  it("agrees with harness.py on which misconceptions pass", () => {
    const r = spawnSync("python3", [resolve(ROOT, "content/verify/harness.py")], {
      encoding: "utf8",
      input: "",
      cwd: ROOT,
      maxBuffer: 1 << 24,
    });
    // sanity: harness ran against the real corpus
    expect(r.stdout).toContain("GATE 5");
    const harnessFails = new Set<string>();
    for (const line of r.stdout.split("\n")) {
      const mm = /^\s{2}(mis\.\S+)\s+(.*)$/.exec(line);
      if (mm && mm[2] !== "ok") harnessFails.add(mm[1]!);
    }

    const tsFails = new Set(
      gateFixtures(loadContent(resolve(ROOT, "content")))
        .filter((i) => i.level === "error")
        .map((i) => i.message.split(":")[0]!),
    );

    expect([...tsFails].sort()).toEqual([...harnessFails].sort());
  });
});
