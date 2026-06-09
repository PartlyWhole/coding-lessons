import { describe, it, expect } from "vitest";
import { resolve } from "node:path";
import { loadContent } from "../src/load.js";
import { gateOracle } from "../src/gates/oracle.js";

const CONTENT = resolve(__dirname, "../../../content");

describe("gate 6: reference-impl oracle smoke", () => {
  it("every build step's referenceImpl parses and runs on sampled generators", () => {
    expect(gateOracle(loadContent(CONTENT)).filter((i) => i.level === "error")).toEqual([]);
  });
});
