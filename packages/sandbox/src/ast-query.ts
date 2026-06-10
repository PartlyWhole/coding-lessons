// packages/sandbox/src/ast-query.ts
// §6.3 AstQuery interpreter, lifted from content/verify/harness.py (lines 45-149) so the
// runtime matcher is the SAME algorithm as the differential oracle -- zero version-skew
// with execution. Implements field/within/childMatches/not/all/any/count + pinned rules.
// NOTE: the `pred_ok` "calls" branch is rephrased from harness.py's line-continuation
// form into an `if` form (semantically identical) to keep this template literal escape-free.

// One NUL byte built at runtime; the source file stays pure ASCII.
const NUL = String.fromCharCode(0);
export const MATCH_SENTINEL = NUL + "__TRELLIS_TAGS__" + NUL;

export const AST_QUERY_INTERPRETER = `
import ast, json

def parents(tree):
    p = {}
    for node in ast.walk(tree):
        for ch in ast.iter_child_nodes(node):
            p[ch] = node
    return p

def call_name(node):
    if not isinstance(node, ast.Call):
        return None
    f = node.func
    if isinstance(f, ast.Name):
        return f.id
    if isinstance(f, ast.Attribute):
        base = f.value.id if isinstance(f.value, ast.Name) else "?"
        return f"{base}.{f.attr}"
    return None

def pred_ok(where, node):
    # M6.5 additive, RUNTIME-INTERNAL: pred-level negation. The frozen schema's AstPred
    # union has no "not", so CONTENT can never author this -- it exists solely for the
    # await-less-loop pre-check's query ("While with NO Await descendant", section 17.5
    # guard 1), built in code by @trellis/runtime. harness.py (not ours) lacks it; the
    # gate-5 differential is unaffected because no corpus query can contain it.
    if "not" in where:
        return not pred_ok(where["not"], node)
    if "attr" in where:
        val = where["eq"]
        if where["attr"] == "value" and isinstance(node, ast.Constant):
            return node.value == val
        if where["attr"] == "ops" and isinstance(node, ast.Compare):
            return [type(o).__name__ for o in node.ops] == val
        return getattr(node, where["attr"], None) == val
    if "calls" in where:
        nm = where["calls"]
        if isinstance(node, ast.Call):
            return call_name(node) == nm
        return any(call_name(c) == nm for c in ast.walk(node) if isinstance(c, ast.Call))
    if "usesName" in where:
        return any(isinstance(x, ast.Name) and x.id == where["usesName"] for x in ast.walk(node))
    if "childMatches" in where:
        return any(node_matches(where["childMatches"], d, None) for d in ast.walk(node))
    return True

NODE_TYPES = {
    "Call": ast.Call, "BinOp": ast.BinOp, "Compare": ast.Compare, "For": ast.For,
    "While": ast.While, "If": ast.If, "Return": ast.Return, "Constant": ast.Constant,
    "Name": ast.Name, "Assign": ast.Assign, "Expr": ast.Expr, "Break": ast.Break,
    "Import": ast.Import, "ImportFrom": ast.ImportFrom, "Attribute": ast.Attribute,
    # M6.5 additive: the await-less-loop pre-check (§17.5 guard 1) queries for Await.
    # NOTE: a deliberate superset of content/verify/harness.py's NODE_TYPES (not ours
    # to edit) — corpus queries use neither, so the gate-5 differential is unaffected;
    # the orchestrator-owned validate.py port should mirror this entry.
    "Await": ast.Await,
}

def node_matches(query, node, parmap):
    if "node" not in query:
        return query_matches(query, node, parmap)
    cls = NODE_TYPES.get(query["node"])
    if cls is None or not isinstance(node, cls):
        return False
    if "where" in query and not pred_ok(query["where"], node):
        return False
    return True

def _has_ancestor(node, anc_set, parmap):
    cur = parmap.get(node)
    while cur is not None:
        if cur in anc_set:
            return True
        cur = parmap.get(cur)
    return False

def query_matches(query, tree, parmap):
    if "not" in query:
        return not query_matches(query["not"], tree, parmap)
    if "all" in query:
        return all(query_matches(q, tree, parmap) for q in query["all"])
    if "any" in query:
        return any(query_matches(q, tree, parmap) for q in query["any"])
    matches = [nd for nd in ast.walk(tree) if node_matches(query, nd, parmap)]
    if "field" in query:
        def _field_ok(nd):
            for fname, subq in query["field"].items():
                kids = getattr(nd, fname, None)
                kids = kids if isinstance(kids, list) else ([kids] if kids is not None else [])
                if not any(isinstance(k, ast.AST) and query_matches(subq, k, parmap) for k in kids):
                    return False
            return True
        matches = [m for m in matches if _field_ok(m)]
    if "within" in query:
        inside = set(nd for nd in ast.walk(tree) if node_matches(query["within"], nd, parmap))
        matches = [m for m in matches if _has_ancestor(m, inside, parmap)]
    if "count" in query:
        op, k = query["count"]["op"], query["count"]["n"]
        c = len(matches)
        return {"=": c == k, ">=": c >= k, "<=": c <= k}[op]
    return len(matches) > 0

def eval_tags(code, queries):
    try:
        tree = ast.parse(code)
    except SyntaxError:
        return None
    pm = parents(tree)
    return {q["tag"] for q in queries if query_matches(q["query"], tree, pm)}
`;

function toBase64Json(value: unknown): string {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

// A self-contained program that does NOT exec the learner code -- only ast.parse + walk.
// Reads {code, queries} from base64, prints MATCH_SENTINEL + JSON(sorted matched tags).
// MATCH_SENTINEL is embedded via JSON.stringify (escaped \\u0000), never as a raw NUL.
export function buildMatchProgram(
  code: string,
  queries: { tag: string; query: unknown }[],
): string {
  const payload = toBase64Json({ code, queries });
  return (
    AST_QUERY_INTERPRETER +
    `\nimport base64 as _b64\n_payload = json.loads(_b64.b64decode("${payload}").decode("utf-8"))` +
    `\n_tags = eval_tags(_payload["code"], _payload["queries"]) or []` +
    `\nimport sys as _sys\n_sys.stdout.write(${JSON.stringify(MATCH_SENTINEL)} + json.dumps(sorted(_tags)))`
  );
}
