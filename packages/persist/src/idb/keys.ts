import type { KeyRange } from "./types.js";

// IndexedDB key ordering (subset): number < string < array; arrays compared elementwise,
// shorter is smaller on a common prefix. Sufficient for our keys (string ids, [stepId, ts]).
export function compareKeys(a: IDBValidKey, b: IDBValidKey): number {
  const ra = rank(a);
  const rb = rank(b);
  if (ra !== rb) return ra - rb;
  if (Array.isArray(a) && Array.isArray(b)) {
    const n = Math.min(a.length, b.length);
    for (let i = 0; i < n; i++) {
      const c = compareKeys(a[i] as IDBValidKey, b[i] as IDBValidKey);
      if (c !== 0) return c;
    }
    return a.length - b.length;
  }
  if (typeof a === "number" && typeof b === "number") return a - b;
  // strings (and Dates coerced away — unused here): lexical
  return String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0;
}

function rank(k: IDBValidKey): number {
  if (typeof k === "number") return 0;
  if (typeof k === "string") return 1;
  if (Array.isArray(k)) return 2;
  return 3; // unsupported types sort last; not used by our stores
}

export function inRange(key: IDBValidKey, range: KeyRange): boolean {
  if ("only" in range) return compareKeys(key, range.only) === 0;
  if (range.lower !== undefined) {
    const c = compareKeys(key, range.lower);
    if (c < 0 || (c === 0 && range.lowerOpen)) return false;
  }
  if (range.upper !== undefined) {
    const c = compareKeys(key, range.upper);
    if (c > 0 || (c === 0 && range.upperOpen)) return false;
  }
  return true;
}
