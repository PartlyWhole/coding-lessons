import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { EditorView } from "@codemirror/view";
import { EditorPane } from "../src/editor/EditorPane.js";

describe("EditorPane (CodeMirror)", () => {
  it("renders the initial value into the editor DOM", () => {
    const { container } = render(<EditorPane value={"hello = 1"} onChange={() => {}} />);
    const content = container.querySelector(".cm-content");
    expect(content).toBeTruthy();
    expect(content!.textContent).toContain("hello = 1");
  });

  it("renders read-only when readOnly is set (cm-content not editable)", () => {
    const { container } = render(<EditorPane value={"y"} onChange={() => {}} readOnly />);
    const content = container.querySelector(".cm-content");
    expect(content!.getAttribute("contenteditable")).toBe("false");
  });

  it("marks locked lines with cm-lockedLine and their gutter with cm-lockedGutter (styling contract)", () => {
    const { container } = render(
      <EditorPane
        value={"a = 1\nb = 2\nc = 3"}
        onChange={() => {}}
        lockedRegions={[{ startLine: 1, endLine: 2 }]}
      />,
    );
    const lockedLines = container.querySelectorAll(".cm-line.cm-lockedLine");
    expect(lockedLines.length).toBe(2);
    expect([...lockedLines].map((l) => l.textContent)).toEqual(["a = 1", "b = 2"]);
    const lockedGutters = container.querySelectorAll(".cm-gutterElement span.cm-lockedGutter");
    expect(lockedGutters.length).toBe(2);
    // unlocked line 3 carries neither
    const allLines = [...container.querySelectorAll(".cm-line")];
    expect(allLines[2]!.classList.contains("cm-lockedLine")).toBe(false);
  });

  it("applies the trellisEditor terrarium theme (dark editor in both page modes)", () => {
    const { container } = render(<EditorPane value={"x"} onChange={() => {}} />);
    // the theme registers as a dark theme on the view's state
    const cmHost = container.querySelector(".cm-editor")! as HTMLElement & { cmView?: { view: EditorView } };
    const view = EditorView.findFromDOM(cmHost)!;
    expect(view).not.toBeNull();
    expect(view.state.facet(EditorView.darkTheme)).toBe(true);
  });
});
