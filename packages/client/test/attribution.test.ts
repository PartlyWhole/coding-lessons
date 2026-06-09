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
});
