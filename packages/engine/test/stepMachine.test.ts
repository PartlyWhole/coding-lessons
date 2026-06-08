import { describe, it, expect } from "vitest";
import { initialState, step, StepTransitionError } from "../src/stepMachine.js";

describe("step machine — non-build (recognize)", () => {
  it("walks PENDING→ACTIVE→EVALUATING→FEEDBACK→RELEASED on a correct submission", () => {
    let s = initialState();
    expect(s.phase).toBe("PENDING");
    s = step("recognize", s, { type: "enter" });
    expect(s.phase).toBe("ACTIVE");
    s = step("recognize", s, { type: "submit" });
    expect(s.phase).toBe("EVALUATING");
    s = step("recognize", s, { type: "diagnosis", correct: true });
    expect(s.phase).toBe("FEEDBACK");
    expect(s.lastCorrect).toBe(true);
    s = step("recognize", s, { type: "advance" });
    expect(s.phase).toBe("RELEASED");
  });

  it("allows retry from FEEDBACK back to ACTIVE", () => {
    let s = initialState();
    s = step("recognize", s, { type: "enter" });
    s = step("recognize", s, { type: "submit" });
    s = step("recognize", s, { type: "diagnosis", correct: false });
    expect(s.phase).toBe("FEEDBACK");
    s = step("recognize", s, { type: "retry" });
    expect(s.phase).toBe("ACTIVE");
  });

  it("blocks advance after an incorrect submission unless allowSkip", () => {
    let s = initialState();
    s = step("recognize", s, { type: "enter" });
    s = step("recognize", s, { type: "submit" });
    s = step("recognize", s, { type: "diagnosis", correct: false });
    expect(() => step("recognize", s, { type: "advance" })).toThrow(StepTransitionError);
    const released = step("recognize", s, { type: "advance", allowSkip: true });
    expect(released.phase).toBe("RELEASED");
  });

  it("treats hint as phase-preserving in FEEDBACK", () => {
    let s = initialState();
    s = step("recognize", s, { type: "enter" });
    s = step("recognize", s, { type: "submit" });
    s = step("recognize", s, { type: "diagnosis", correct: false });
    const after = step("recognize", s, { type: "hint" });
    expect(after.phase).toBe("FEEDBACK");
  });
});

describe("step machine — watch skips EVALUATING", () => {
  it("walks PENDING→ACTIVE→RELEASED with advance and rejects submit", () => {
    let s = initialState();
    s = step("watch", s, { type: "enter" });
    expect(s.phase).toBe("ACTIVE");
    expect(() => step("watch", s, { type: "submit" })).toThrow(StepTransitionError);
    s = step("watch", s, { type: "advance" });
    expect(s.phase).toBe("RELEASED");
  });
});

describe("step machine — invalid transitions throw", () => {
  it("rejects submit before enter", () => {
    expect(() => step("recognize", initialState(), { type: "submit" })).toThrow(
      StepTransitionError,
    );
  });
});
