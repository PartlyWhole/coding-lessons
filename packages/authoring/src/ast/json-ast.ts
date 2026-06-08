export interface JsonNode {
  _type: string;
  [field: string]: unknown;
}

export function isNode(v: unknown): v is JsonNode {
  return typeof v === "object" && v !== null && typeof (v as JsonNode)._type === "string";
}

/** All AST-typed descendants of `root`, including `root` (mirrors ast.walk: order irrelevant). */
export function walk(root: JsonNode): JsonNode[] {
  const out: JsonNode[] = [];
  const stack: JsonNode[] = [root];
  while (stack.length) {
    const n = stack.pop()!;
    out.push(n);
    for (const child of childNodes(n)) stack.push(child);
  }
  return out;
}

/** Immediate AST children of a node (mirrors ast.iter_child_nodes). */
export function childNodes(n: JsonNode): JsonNode[] {
  const out: JsonNode[] = [];
  for (const k of Object.keys(n)) {
    if (k === "_type") continue;
    const v = n[k];
    if (isNode(v)) out.push(v);
    else if (Array.isArray(v)) for (const e of v) if (isNode(e)) out.push(e);
  }
  return out;
}

/** child -> parent map over the whole tree (mirrors harness.parents). Identity-keyed. */
export function buildParents(root: JsonNode): Map<JsonNode, JsonNode> {
  const parents = new Map<JsonNode, JsonNode>();
  for (const n of walk(root)) for (const c of childNodes(n)) parents.set(c, n);
  return parents;
}

/** name of a Call's target: print / input / random.randint (mirrors harness.call_name). */
export function callName(node: JsonNode): string | null {
  if (node._type !== "Call") return null;
  const f = node["func"];
  if (!isNode(f)) return null;
  if (f._type === "Name") return f["id"] as string;
  if (f._type === "Attribute") {
    const base = isNode(f["value"]) && (f["value"] as JsonNode)._type === "Name"
      ? ((f["value"] as JsonNode)["id"] as string)
      : "?";
    return `${base}.${f["attr"] as string}`;
  }
  return null;
}

export function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((x, i) => deepEqual(x, b[i]));
  }
  if (a && b && typeof a === "object" && typeof b === "object") {
    const ka = Object.keys(a as object), kb = Object.keys(b as object);
    return ka.length === kb.length && ka.every((k) => deepEqual((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]));
  }
  return false;
}
