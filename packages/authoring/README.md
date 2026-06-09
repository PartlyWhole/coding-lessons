# @trellis/authoring

The Trellis content compiler/validator CLI (`trellis lint | build | grade`) and the §13.2 gates.

Compiles source YAML under `content/` into the frozen `@trellis/schema` `Bundle`.

**Requires `python3` on PATH** (CPython 3.9+) for two build-time primitives: `ast.parse`
(the §6.3 AST detector) and per-test-case execution (gates 5/6). These mirror the Python
reference validators (`content/validate.py`, `content/verify/harness.py`), which are kept as
a differential oracle.
