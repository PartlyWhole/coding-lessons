import { describe, it, expect } from "vitest";
import { EditorState } from "@codemirror/state";
import { lineRangesToOffsets, lockedRegionsExtension } from "../src/editor/lockedRegions.js";

const DOC = "line1\nline2\nline3\nline4"; // lines are 1-based

describe("lineRangesToOffsets", () => {
  it("maps 1-based inclusive line ranges to {from,to} char offsets", () => {
    const offs = lineRangesToOffsets(EditorState.create({ doc: DOC }).doc, [{ startLine: 2, endLine: 2 }]);
    // line2 starts after "line1\n" (offset 6) and ends at offset 11
    expect(offs).toEqual([{ from: 6, to: 11 }]);
  });
});

describe("lockedRegionsExtension (transactionFilter)", () => {
  function stateWith(ranges: { startLine: number; endLine: number }[]) {
    return EditorState.create({ doc: DOC, extensions: [lockedRegionsExtension(ranges)] });
  }

  it("blocks an edit that touches a locked line", () => {
    const s = stateWith([{ startLine: 2, endLine: 2 }]);
    const next = s.update({ changes: { from: 7, insert: "X" } }).state; // offset 7 is inside line2
    expect(next.doc.toString()).toBe(DOC); // change cancelled → doc unchanged
  });

  it("allows an edit outside locked lines", () => {
    const s = stateWith([{ startLine: 2, endLine: 2 }]);
    const next = s.update({ changes: { from: 0, insert: "X" } }).state; // line1, not locked
    expect(next.doc.toString()).toBe("X" + DOC);
  });

  it("is a no-op when there are no locked regions", () => {
    const s = stateWith([]);
    const next = s.update({ changes: { from: 7, insert: "X" } }).state;
    expect(next.doc.toString()).not.toBe(DOC);
  });
});
