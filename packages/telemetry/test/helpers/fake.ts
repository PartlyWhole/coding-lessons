import type { Clock, Timer, ListenerTarget, Ids } from "../../src/ports.js";

export class FakeClock implements Clock {
  private t = 0;
  private timers = new Map<number, { at: number; fn: () => void }>();
  private nextId = 1;
  now(): number {
    return this.t;
  }
  setTimer(fn: () => void, ms: number): Timer {
    const id = this.nextId++;
    this.timers.set(id, { at: this.t + ms, fn });
    return id as unknown as Timer;
  }
  clearTimer(t: Timer): void {
    this.timers.delete(t as unknown as number);
  }
  /** Advance time, firing due timers in order. */
  tick(ms: number): void {
    const target = this.t + ms;
    for (;;) {
      const due = [...this.timers.entries()]
        .filter(([, v]) => v.at <= target)
        .sort((a, b) => a[1].at - b[1].at)[0];
      if (!due) break;
      this.t = due[1].at;
      this.timers.delete(due[0]);
      due[1].fn();
    }
    this.t = target;
  }
}

export class FakeListenerTarget implements ListenerTarget {
  private subs = new Map<string, Set<() => void>>();
  hidden = false;
  addEventListener(type: string, fn: () => void): void {
    if (!this.subs.has(type)) this.subs.set(type, new Set());
    this.subs.get(type)!.add(fn);
  }
  removeEventListener(type: string, fn: () => void): void {
    this.subs.get(type)?.delete(fn);
  }
  fire(type: string): void {
    for (const fn of this.subs.get(type) ?? []) fn();
  }
  listenerCount(): number {
    return [...this.subs.values()].reduce((n, s) => n + s.size, 0);
  }
}

export function seqIds(prefix = "id"): Ids {
  let n = 0;
  return { uuid: () => `${prefix}-${n++}` };
}
