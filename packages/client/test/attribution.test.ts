import { describe, it, expect } from "vitest";
import { attributionStyle } from "../src/attribution.js";

describe("attribution styling (§5.1 FEEDBACK)", () => {
  it("maps every Attribution to a stable label + color", () => {
    expect(attributionStyle("pass").label).toMatch(/correct/i);
    expect(attributionStyle("misconception").label.length).toBeGreaterThan(0);
    for (const a of ["pass", "misconception", "syntax", "runtime", "mismatch"] as const) {
      const s = attributionStyle(a);
      expect(s.color).toMatch(/^#|rgb|hsl/); // a real CSS color
      expect(typeof s.label).toBe("string");
    }
  });
  it("distinguishes pass from failures by color", () => {
    expect(attributionStyle("pass").color).not.toBe(attributionStyle("syntax").color);
  });
  it("uses the approved Greenhouse --attr-*-ink hexes (design handback 2026-06-09)", () => {
    expect(attributionStyle("pass").color).toBe("#1A7F4B");
    expect(attributionStyle("misconception").color).toBe("#9C6310");
    expect(attributionStyle("mismatch").color).toBe("#7E6A14");
    expect(attributionStyle("syntax").color).toBe("#BE4039");
    expect(attributionStyle("runtime").color).toBe("#BE4039");
  });
});
