import { parsePython } from "./python.js";
import { walk, callName, deepEqual, isNode, buildParents } from "./json-ast.js";
import type { JsonNode } from "./json-ast.js";

type Query = Record<string, unknown>;
type Pred = Record<string, unknown>;

function predOk(where: Pred, node: JsonNode, parents: Map<JsonNode, JsonNode>): boolean {
  if ("attr" in where) {
    const attr = where["attr"] as string;
    const val = where["eq"];
    // NOTE: strict equality (===), unlike harness.py's Python `==`. The corpus only compares
    // strings and `eq: true` vs a literal `True`, so they agree (the differential gate confirms);
    // an authored `eq: 1` vs a `True` constant (or `1.0` vs `1`) WOULD diverge — re-check parity.
    if (attr === "value" && node._type === "Constant") return deepEqual(node["value"], val);
    if (attr === "ops" && node._type === "Compare") {
      const ops = (node["ops"] as JsonNode[]).map((o) => o._type);
      return deepEqual(ops, val);
    }
    return deepEqual(node[attr], val);
  }
  if ("calls" in where) {
    const nm = where["calls"] as string;
    if (node._type === "Call") return callName(node) === nm;
    return walk(node).some((c) => c._type === "Call" && callName(c) === nm);
  }
  if ("usesName" in where) {
    const nm = where["usesName"] as string;
    return walk(node).some((x) => x._type === "Name" && x["id"] === nm);
  }
  if ("childMatches" in where) {
    const sub = where["childMatches"] as Query;
    return walk(node).some((d) => nodeMatches(sub, d, parents));
  }
  return true;
}

/** the node's named child field contains a match of Q (§6.3 `field`). */
function fieldMatches(node: JsonNode, name: string, sub: Query, parents: Map<JsonNode, JsonNode>): boolean {
  const v = node[name];
  const roots: JsonNode[] = [];
  if (isNode(v)) roots.push(v);
  else if (Array.isArray(v)) for (const e of v) if (isNode(e)) roots.push(e);
  return roots.some((r) => queryMatches(sub, r, parents));
}

/** does this single node match the query's top-level node spec (+ where + field)? */
function nodeMatches(query: Query, node: JsonNode, parents: Map<JsonNode, JsonNode>): boolean {
  if (!("node" in query)) return queryMatches(query, node, parents); // not/all/any at child position
  if (node._type !== (query["node"] as string)) return false;
  if ("where" in query && !predOk(query["where"] as Pred, node, parents)) return false;
  if ("field" in query) {
    const fields = query["field"] as Record<string, Query>;
    for (const name of Object.keys(fields)) {
      if (!fieldMatches(node, name, fields[name]!, parents)) return false;
    }
  }
  return true;
}

function hasAncestor(node: JsonNode, ancestors: Set<JsonNode>, parents: Map<JsonNode, JsonNode>): boolean {
  let cur = parents.get(node);
  while (cur !== undefined) {
    if (ancestors.has(cur)) return true;
    cur = parents.get(cur);
  }
  return false;
}

/** does `query` match anywhere in `tree`? (harness.query_matches) */
export function queryMatches(rawQuery: unknown, tree: JsonNode, parents: Map<JsonNode, JsonNode>): boolean {
  const query = rawQuery as Query;
  if ("not" in query) return !queryMatches(query["not"] as Query, tree, parents);
  if ("all" in query) return (query["all"] as Query[]).every((qq) => queryMatches(qq, tree, parents));
  if ("any" in query) return (query["any"] as Query[]).some((qq) => queryMatches(qq, tree, parents));

  let matches = walk(tree).filter((nd) => nodeMatches(query, nd, parents));
  if ("within" in query) {
    const inside = new Set(walk(tree).filter((nd) => nodeMatches(query["within"] as Query, nd, parents)));
    matches = matches.filter((m) => hasAncestor(m, inside, parents));
  }
  if ("count" in query) {
    const { op, n } = query["count"] as { op: "=" | ">=" | "<="; n: number };
    const c = matches.length;
    return op === "=" ? c === n : op === ">=" ? c >= n : c <= n;
  }
  return matches.length > 0;
}

export interface TagQuery { tag: string; query: Query; }

/** evaluate all tag queries against code; null signals a syntax error (no tags). */
export function evalTags(code: string, queries: TagQuery[]): Set<string> | null {
  const p = parsePython(code);
  if (p.syntaxError) return null;
  const parents = buildParents(p.ast);
  const out = new Set<string>();
  for (const q of queries) if (queryMatches(q.query, p.ast, parents)) out.add(q.tag);
  return out;
}
