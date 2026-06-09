import { describe, it, expect, vi } from "vitest";
import { createEventBus } from "../src/eventBus.js";
import type { UiEvent } from "../src/eventBus.js";

describe("EventBus (§11.1 stub seam)", () => {
  it("fans out synchronously to subscribers and returns an unsubscribe handle", () => {
    const bus = createEventBus();
    const seen: UiEvent[] = [];
    const off = bus.subscribe((e) => seen.push(e));
    bus.emit({ t: "session_start" });
    bus.emit({ t: "step_enter", stepId: "s1", kind: "build" });
    expect(seen.map((e) => e.t)).toEqual(["session_start", "step_enter"]);
    off();
    bus.emit({ t: "peek_back", stepId: "s1" });
    expect(seen).toHaveLength(2); // no delivery after unsubscribe
  });

  it("emit never throws into the caller even if a subscriber throws", () => {
    const bus = createEventBus();
    bus.subscribe(() => {
      throw new Error("telemetry bug");
    });
    const after = vi.fn();
    bus.subscribe(after);
    expect(() => bus.emit({ t: "run", stepId: "s1" })).not.toThrow();
    expect(after).toHaveBeenCalledOnce(); // a throwing subscriber does not block later ones
  });
});
