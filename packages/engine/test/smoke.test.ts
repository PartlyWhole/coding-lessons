import { describe, it, expect } from "vitest";
import { ENGINE_VERSION } from "../src/index.js";

describe("@trellis/engine scaffold", () => {
  it("exports a version constant", () => {
    expect(ENGINE_VERSION).toBe("0.0.0");
  });
});
