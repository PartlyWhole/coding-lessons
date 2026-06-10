import { describe, it, expect, vi } from "vitest";
import { createEventBus } from "../src/bus.js";
import type { UiEvent } from "../src/bus.js";

describe("EventBus (§11.1 — owned by @trellis/telemetry since M6)", () => {
  it("fans out synchronously to subscribers in subscription order", () => {
    const bus = createEventBus();
    const order: string[] = [];
    bus.subscribe((e) => order.push(`a:${e.t}`));
    bus.subscribe((e) => order.push(`b:${e.t}`));
    bus.emit({ t: "session_start" });
    expect(order).toEqual(["a:session_start", "b:session_start"]); // sync, in order
  });

  it("emit never throws into the caller even if a subscriber throws; later subscribers still run (defining gate d)", () => {
    const bus = createEventBus();
    bus.subscribe(() => {
      throw new Error("telemetry bug");
    });
    const after = vi.fn();
    bus.subscribe(after);
    expect(() => bus.emit({ t: "run", stepId: "s1" })).not.toThrow();
    expect(after).toHaveBeenCalledOnce();
  });

  it("unsubscribe handle removes exactly that subscriber", () => {
    const bus = createEventBus();
    const seen: UiEvent[] = [];
    const kept = vi.fn();
    const off = bus.subscribe((e) => seen.push(e));
    bus.subscribe(kept);
    bus.emit({ t: "peek_back", stepId: "s1" });
    off();
    bus.emit({ t: "peek_back", stepId: "s1" });
    expect(seen).toHaveLength(1);
    expect(kept).toHaveBeenCalledTimes(2);
  });

  it("emit with zero subscribers is a no-op", () => {
    const bus = createEventBus();
    expect(() => bus.emit({ t: "step_enter", stepId: "s1", kind: "build" })).not.toThrow();
  });
});
