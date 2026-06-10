// §17.3 — the integer bridge between the JS step machine and the running Python loop.
// Python captures GEN = int(window.gameGen) at start; every frame it re-reads
// window.gameGen and exits its while-loop when they differ. Bumping is therefore the
// universal stop signal (stop/restart/unmount all bump).
export interface GameGen {
  current(): number;
  bump(): number;
}

export function createGameGen(target: Record<string, unknown> = globalThis as never): GameGen {
  // Adopt an existing counter rather than resetting: a component remount must never
  // rewind the counter to a value an old (still-draining) loop captured as its GEN.
  if (typeof target["gameGen"] !== "number") target["gameGen"] = 0;
  return {
    current: () => target["gameGen"] as number,
    bump: () => {
      const next = (target["gameGen"] as number) + 1;
      target["gameGen"] = next;
      return next;
    },
  };
}
