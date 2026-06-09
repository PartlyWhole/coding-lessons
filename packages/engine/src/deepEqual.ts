import type { Json } from "@trellis/schema";

// Structural equality for Json values (§6.2 deep-equal comparator semantics,
// reused by detect's testFailure.gotEquals). Arrays are order-sensitive; objects
// compare by key set + per-key values, order-independent.
export function deepEqual(a: Json, b: Json): boolean {
  if (a === b) return true;
  if (a === null || b === null) return a === b;
  if (typeof a !== typeof b) return false;
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b)) return false;
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (!deepEqual(a[i] as Json, b[i] as Json)) return false;
    }
    return true;
  }
  if (typeof a === "object" && typeof b === "object") {
    const ao = a as Record<string, Json>;
    const bo = b as Record<string, Json>;
    const ak = Object.keys(ao);
    const bk = Object.keys(bo);
    if (ak.length !== bk.length) return false;
    for (const k of ak) {
      if (!Object.prototype.hasOwnProperty.call(bo, k)) return false;
      if (!deepEqual(ao[k] as Json, bo[k] as Json)) return false;
    }
    return true;
  }
  return false;
}
