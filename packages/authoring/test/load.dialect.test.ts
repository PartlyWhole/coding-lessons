import { describe, it, expect } from "vitest";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { loadContent } from "../src/load.js";

const ROOT = resolve(__dirname, "../../..");
const CONTENT = resolve(ROOT, "content");

describe("YAML dialect parity (js-yaml vs pyyaml)", () => {
  it("agrees on entity counts and a representative scalar requirement", () => {
    const helper = resolve(__dirname, "../py/yaml_to_json.py");
    const r = spawnSync("python3", [helper], {
      encoding: "utf8",
      input: "",
      cwd: ROOT,
      maxBuffer: 1 << 24,
    });
    expect(r.status).toBe(0);
    const py = JSON.parse(r.stdout) as { nodes: number; skills: number; miscons: number };

    const ts = loadContent(CONTENT);
    expect(Object.keys(ts.nodes)).toHaveLength(py.nodes);
    expect(Object.keys(ts.skills)).toHaveLength(py.skills);
    expect(Object.keys(ts.miscons)).toHaveLength(py.miscons);
    expect(ts.nodes["node.random"]!.requires?.[0]).toEqual({
      skill: "skill.var.assign",
      minMastery: 0.6,
      kind: "track",
    });
  });
});
