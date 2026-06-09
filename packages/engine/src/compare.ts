import type { Json } from "@trellis/schema";
import { deepEqual } from "./deepEqual.js";

// §6.2 float-close: abs OR rel tolerance for numerics; recurses into arrays/objects
// so a structure of floats compares element-wise. Non-numerics fall back to deepEqual.
const ABS = 1e-9;
const REL = 1e-6;

export function floatClose(a: Json, b: Json): boolean {
  if (typeof a === "number" && typeof b === "number") {
    // NaN is never close to anything, including itself — intentional IEEE semantics
    // (JSON has no NaN, so this only guards non-spec inputs deterministically).
    if (Number.isNaN(a) || Number.isNaN(b)) return false;
    if (a === b) return true;
    const diff = Math.abs(a - b);
    return diff <= ABS || diff <= REL * Math.max(Math.abs(a), Math.abs(b));
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((x, i) => floatClose(x as Json, b[i] as Json));
  }
  if (a !== null && b !== null && typeof a === "object" && typeof b === "object") {
    const ao = a as Record<string, Json>;
    const bo = b as Record<string, Json>;
    const ak = Object.keys(ao);
    if (ak.length !== Object.keys(bo).length) return false;
    return ak.every(
      (k) => Object.prototype.hasOwnProperty.call(bo, k) && floatClose(ao[k] as Json, bo[k] as Json),
    );
  }
  return deepEqual(a, b);
}

// §6.2 set-equal: order-insensitive multiset equality for arrays. Elements are compared
// with deepEqual (NOT floatClose) and nested arrays stay order-sensitive. Non-arrays fall
// back to deepEqual.
export function setEqual(a: Json, b: Json): boolean {
  if (!Array.isArray(a) || !Array.isArray(b)) return deepEqual(a, b);
  if (a.length !== b.length) return false;
  const remaining = [...b] as Json[];
  for (const x of a as Json[]) {
    const idx = remaining.findIndex((y) => deepEqual(x, y));
    if (idx === -1) return false;
    remaining.splice(idx, 1);
  }
  // Equal lengths + every element of `a` consumed once → multisets match.
  return true;
}

export type Comparator = "deep-equal" | "float-close" | "set-equal";

export function compareValues(comparator: Comparator | undefined, a: Json, b: Json): boolean {
  switch (comparator) {
    case "float-close":
      return floatClose(a, b);
    case "set-equal":
      return setEqual(a, b);
    case "deep-equal":
    case undefined:
      return deepEqual(a, b);
  }
}
