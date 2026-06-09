// Minimal Buffer ambient declaration for the engine's Node runtime.
// @types/node is not installed in this package; we declare only the
// subset used by pyDriver.ts (Buffer.from + toString("base64")).
// At M5, when the browser bundle swaps to btoa, this file goes away.
declare const Buffer: {
  from(value: string, encoding: "utf-8"): { toString(encoding: "base64"): string };
};
