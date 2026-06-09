import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { TinyMarkdown } from "../src/markdown/tinyMarkdown.js";

// The ⚑ watch-step markdown subset (design handback §4): paragraphs, **bold**,
// `inline code`, indented code → terrarium block. Shapes taken from the real corpus
// (content/nodes/string_concat.yaml watch bodies).
describe("TinyMarkdown (watch-step body subset)", () => {
  it("splits paragraphs on blank lines", () => {
    const { container } = render(<TinyMarkdown text={"First para.\n\nSecond para."} />);
    const ps = container.querySelectorAll("p");
    expect(ps.length).toBe(2);
    expect(ps[0]!.textContent).toBe("First para.");
    expect(ps[1]!.textContent).toBe("Second para.");
  });

  it("joins hard-wrapped lines within one paragraph", () => {
    const { container } = render(<TinyMarkdown text={"wrapped\nline"} />);
    const ps = container.querySelectorAll("p");
    expect(ps.length).toBe(1);
    expect(ps[0]!.textContent).toBe("wrapped line");
  });

  it("renders **bold** and `inline code`", () => {
    const { container } = render(
      <TinyMarkdown text={"the same `+` also **ties strings together** end to end."} />,
    );
    expect(container.querySelector("code")!.textContent).toBe("+");
    expect(container.querySelector("strong")!.textContent).toBe("ties strings together");
    expect(container.textContent).toBe("the same + also ties strings together end to end.");
  });

  it("renders 4-space-indented runs as a pre.code terrarium block, dedented", () => {
    const body = 'Intro text:\n\n    print("This " + "is" + " cool!")\n\nOutro `This is cool!`';
    const { container } = render(<TinyMarkdown text={body} />);
    const pre = container.querySelector("pre.code");
    expect(pre).not.toBeNull();
    expect(pre!.textContent).toBe('print("This " + "is" + " cool!")');
    expect(container.querySelectorAll("p").length).toBe(2);
  });

  it("keeps multi-line code blocks together with inner relative indentation", () => {
    const body = "ways:\n\n    str(number)            # then glue\n    f\"...{number}...\"       # drops it in\n\nBoth print `n: 7`.";
    const { container } = render(<TinyMarkdown text={body} />);
    const pre = container.querySelector("pre.code");
    expect(pre!.textContent).toBe('str(number)            # then glue\nf"...{number}..."       # drops it in');
  });

  it("preserves block order", () => {
    const { container } = render(<TinyMarkdown text={"a\n\n    code\n\nb"} />);
    const kids = [...container.querySelectorAll("p, pre")];
    expect(kids.map((k) => k.tagName)).toEqual(["P", "PRE", "P"]);
  });
});
