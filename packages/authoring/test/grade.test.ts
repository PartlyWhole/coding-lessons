import { describe, it, expect } from "vitest";
import { resolve } from "node:path";
import { loadContent } from "../src/load.js";
import { gradeBuild } from "../src/grade.js";

const CONTENT = resolve(__dirname, "../../../content");

describe("gradeBuild (dry-run authoring grader)", () => {
  const loaded = loadContent(CONTENT);

  it("passes a correct submission for the string-concat greet step", () => {
    const res = gradeBuild(
      loaded,
      "cell.string_concat.join_text#4",
      'def greet(name):\n    return "Hi " + name + "!"',
    );
    expect(res.attribution).toBe("pass");
    expect(res.misconceptionId).toBeUndefined();
  });

  it("attributes the str/num coercion misconception on a wrong submission", () => {
    const res = gradeBuild(
      loaded,
      "cell.string_concat.text_plus_number#4",
      'def announce(number):\n    return "Your random number is: " + number',
    );
    expect(res.attribution).toBe("misconception");
    expect(res.misconceptionId).toBe("mis.concat.str_num");
  });
});
