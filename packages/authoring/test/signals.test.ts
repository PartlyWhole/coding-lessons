import { describe, it, expect } from "vitest";
import { resolve } from "node:path";
import { loadContent } from "../src/load.js";
import { signalsFor } from "../src/signals.js";

const CONTENT = resolve(__dirname, "../../../content");

describe("signalsFor", () => {
  const loaded = loadContent(CONTENT);

  it("recognize -> chosenChoiceId", () => {
    const s = signalsFor({ stepKind: "recognize", choice: "b" }, loaded.miscons["mis.print.unquoted"]!, loaded);
    expect(s.chosenChoiceId).toBe("b");
  });

  it("recall -> recallInput", () => {
    const s = signalsFor({ stepKind: "recall", input: "str" }, loaded.miscons["mis.type.int_input"]!, loaded);
    expect(s.recallInput).toBe("str");
  });

  it("build fixture -> astTags from the owning node's build step", () => {
    const mis = loaded.miscons["mis.print.no_call"]!;
    const trigger = mis.triggers!.find((t) => t.stepKind === "build")!;
    const s = signalsFor(trigger, mis, loaded);
    expect(s.astTags).toBeInstanceOf(Set);
    expect([...(s.astTags ?? [])]).toContain("no_print_call");
  });
});
