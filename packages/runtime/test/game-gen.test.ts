import { describe, it, expect } from "vitest";
import { createGameGen } from "../src/game-gen.js";

describe("gameGen (§17.3)", () => {
  it("installs a numeric gameGen on the target and bumps monotonically", () => {
    const target: Record<string, unknown> = {};
    const gen = createGameGen(target);
    expect(target["gameGen"]).toBe(0);
    expect(gen.bump()).toBe(1);
    expect(target["gameGen"]).toBe(1);
    expect(gen.bump()).toBe(2);
  });
  it("current() always mirrors the target value (Python reads window.gameGen)", () => {
    const target: Record<string, unknown> = {};
    const gen = createGameGen(target);
    gen.bump();
    gen.bump();
    expect(gen.current()).toBe(target["gameGen"]);
  });
  it("adopts an existing counter instead of resetting it (remount must not revive an old loop)", () => {
    const target: Record<string, unknown> = { gameGen: 7 };
    const gen = createGameGen(target);
    expect(gen.current()).toBe(7);
    expect(gen.bump()).toBe(8);
  });
});
