// Deterministic PRNG (mulberry32) seeded ONLY from PropertyConfig.seed. The whole
// point of M3b is reproducibility: no Date.now() / Math.random() anywhere (§6.4).

export interface Prng {
  nextU32(): number; // uint32
  nextFloat(): number; // [0, 1)
  nextInt(minIncl: number, maxIncl: number): number; // inclusive both ends
  pick<T>(arr: readonly T[]): T;
}

export function makePrng(seed: number): Prng {
  // Coerce to a uint32 state. mulberry32 is a well-known tiny, well-distributed PRNG.
  let a = seed >>> 0;
  const nextU32 = (): number => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return (t ^ (t >>> 14)) >>> 0;
  };
  const nextFloat = (): number => nextU32() / 0x100000000; // 2^32
  const nextInt = (minIncl: number, maxIncl: number): number => {
    const lo = Math.ceil(minIncl);
    const hi = Math.floor(maxIncl);
    if (hi <= lo) return lo;
    const span = hi - lo + 1;
    return lo + (nextU32() % span);
  };
  const pick = <T>(arr: readonly T[]): T => {
    if (arr.length === 0) throw new Error("pick from empty array");
    return arr[nextInt(0, arr.length - 1)]!;
  };
  return { nextU32, nextFloat, nextInt, pick };
}
