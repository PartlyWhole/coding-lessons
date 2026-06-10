#!/bin/bash
# The §4.1 integration battery, exit-code-strict. Born after piped one-liners masked
# real failures twice (grep/tail swallow the producer's exit code; PIPESTATUS is easy
# to forget). Every step runs bare, fails the script, and prints its own verdict.
#
# Usage: verification/run-all-gates.sh [--browser]   (from the repo root)
#   --browser additionally runs the three Playwright harnesses (m6 + m65 self-serve;
#   crash-repro gets a server). Ports 89xx; override base with TRELLIS_PORT_BASE.
set -euo pipefail
cd "$(dirname "$0")/.."
export PATH="/opt/homebrew/lib/node_modules/corepack/shims:$PATH"
BASE="${TRELLIS_PORT_BASE:-8950}"

echo "== lockfile + install (FIRST — a merged branch may add workspace links) =="
pnpm install --frozen-lockfile >/dev/null; echo "frozen-lockfile install OK"

echo "== turbo chain =="
pnpm typecheck >/dev/null; echo "turbo typecheck OK"
pnpm lint      >/dev/null; echo "turbo lint OK"
pnpm build     >/dev/null; echo "turbo build OK"

echo "== workspace tests (sequential) =="
pnpm -r --workspace-concurrency=1 test > /tmp/trellis-gate-tests.log 2>&1 \
  || { echo "TESTS FAILED — tail of log:"; tail -40 /tmp/trellis-gate-tests.log; exit 1; }
grep -E "Tests  [0-9]+ passed" /tmp/trellis-gate-tests.log

echo "== native-ESM probes =="
for p in packages/*/; do
  name=$(basename "$p")
  [ "$name" = "client" ] && continue
  [ -f "$p/dist/src/index.js" ] || { echo "$name: no dist (skipped — verify intentional)"; continue; }
  node -e "import('./$p/dist/src/index.js').then(()=>console.log('$name probe OK')).catch(e=>{console.error('$name probe FAIL',e);process.exit(1)})"
done
node packages/client/test/esm-probe.mjs

echo "== content gates =="
python3 content/validate.py >/dev/null; echo "validate.py PASS"
python3 content/verify/harness.py >/dev/null; echo "harness.py PASS"
node packages/authoring/dist/src/cli.js lint content >/dev/null; echo "authoring CLI lint PASS"

if [ "${1:-}" = "--browser" ]; then
  echo "== browser harnesses (each runs only if its file exists on this checkout) =="
  if [ -f verification/run-m6-telemetry.mjs ]; then
    ( cd verification && TRELLIS_PORT=$((BASE)) node run-m6-telemetry.mjs >/tmp/trellis-gate-m6.log 2>&1 ) \
      || { echo "m6 harness FAILED:"; tail -20 /tmp/trellis-gate-m6.log; exit 1; }
    grep -E "ALL PASS|FAIL" /tmp/trellis-gate-m6.log | tail -3
  fi
  ( cd verification && TRELLIS_PORT=$((BASE+2)) node run-m65-pygame.mjs   >/tmp/trellis-gate-m65.log 2>&1 ) \
    || { echo "m65 harness FAILED:"; tail -20 /tmp/trellis-gate-m65.log; exit 1; }
  grep -cE "^PASS" /tmp/trellis-gate-m65.log | xargs -I{} echo "m65: {} checks PASS"
  grep -qE "FAILURES PRESENT|^FAIL" /tmp/trellis-gate-m65.log && { echo "m65 has FAILs"; exit 1; }
  python3 -m http.server $((BASE+4)) >/dev/null 2>&1 & SRV=$!
  sleep 2
  ( cd verification && TRELLIS_PORT=$((BASE+4)) node run-l-crash-repro.mjs >/tmp/trellis-gate-crash.log 2>&1 ) \
    || { kill $SRV 2>/dev/null; echo "crash-repro FAILED:"; tail -20 /tmp/trellis-gate-crash.log; exit 1; }
  kill $SRV 2>/dev/null
  python3 - <<'EOF'
import json,sys
rs=json.load(open("verification/evidence/l-crash-repro.json"))["results"]
ok=sum(1 for r in rs if r["pass"]); print(f"crash-repro: {ok}/{len(rs)} PASS")
sys.exit(0 if ok==len(rs) else 1)
EOF
fi
echo "=== ALL GATES GREEN (exit-code-strict) ==="
