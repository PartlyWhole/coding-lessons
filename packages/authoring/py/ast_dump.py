#!/usr/bin/env python3
"""Read Python source from stdin, print a JSON AST. On SyntaxError, print {"_syntaxError": true}.
Each AST node -> {"_type": <ClassName>, <field>: <value|node|list>}. Mirrors CPython ast exactly."""
import ast, json, sys

def conv(node):
    if isinstance(node, ast.AST):
        d = {"_type": type(node).__name__}
        for f in node._fields:
            d[f] = conv(getattr(node, f, None))
        return d
    if isinstance(node, list):
        return [conv(x) for x in node]
    return node  # str / int / float / bool / None

src = sys.stdin.read()
try:
    tree = ast.parse(src)
except SyntaxError:
    print(json.dumps({"_syntaxError": True}))
    sys.exit(0)
print(json.dumps(conv(tree), default=str))
