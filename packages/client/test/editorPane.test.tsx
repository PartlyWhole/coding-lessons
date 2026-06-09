import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
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
});
