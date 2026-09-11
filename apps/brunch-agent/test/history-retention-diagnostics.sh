#!/usr/bin/env bash
# Safety replay. Caller MUST verify and apply the process-tree network guard first.
# Default includes the actual browser witness; "recovery" runs only synthetic recovery controls.
set -euo pipefail
ROOT=$(git rev-parse --show-toplevel)
BASE=${1:-${TMPDIR:-/tmp}}
MODE=${2:-all}
[[ "$MODE" == all || "$MODE" == recovery ]]
OUT=$(mktemp -d "$BASE/a4-safety-XXXXXXXX")
printf '%s\n' "$OUT"
python3 - "$ROOT" "$OUT" <<'PY'
import gzip, hashlib, json, sys
from pathlib import Path
root, out = map(Path, sys.argv[1:])
paths = list((root / "apps/brunch-agent/test").glob("history-retention*"))
paths += list((root / "apps/brunch-agent/dist").glob("*.mjs"))
paths += list((root / ".yarn/patches").glob("*flue-runtime*"))
paths += [root / "node_modules/@flue/runtime/dist/conversation-stream-store-CXwRWonS.mjs", root / "libs/@hashintel/brunch-agent/packages/core/src/flue.ts"]
manifest = {}
for path in paths:
    if not path.is_file():
        continue
    data = path.read_bytes()
    manifest[str(path.relative_to(root))] = hashlib.sha256(data).hexdigest()
    if path.parent == root / "apps/brunch-agent/test":
        target = out / "instrument" / (path.name + ".gz")
        target.parent.mkdir(exist_ok=True)
        target.write_bytes(gzip.compress(data, mtime=0))
(out / "source-build-identities.json").write_text(json.dumps(manifest, indent=2) + "\n")
PY
export YARN_ENABLE_NETWORK=0 COREPACK_ENABLE_NETWORK=0 CARGO_NET_OFFLINE=true OTEL_SDK_DISABLED=true
unset HASH_OTLP_ENDPOINT
cd "$ROOT/apps/brunch-agent"
failed=0
run() {
  local expected=$1 log=$2
  shift 2
  printf '%q ' "$@" >> "$OUT/commands.log"
  printf '\n' >> "$OUT/commands.log"
  local code=0
  "$@" > "$log" 2>&1 || code=$?
  printf 'exit=%s expected=%s log=%s\n' "$code" "$expected" "$log" >> "$OUT/commands.log"
  if [[ "$code" != "$expected" ]]; then failed=1; fi
}
if [[ "$MODE" == all ]]; then
  run 0 "$OUT/browser.log" env M7_BROWSER_OUTPUT="$OUT/browser" node --experimental-strip-types test/transition-records.integration.ts
  run 0 "$OUT/fold.log" env A4_OUTPUT_DIRECTORY="$OUT/browser" node --experimental-strip-types test/history-retention-new-records.integration.ts
  run 0 "$OUT/reopen.log" env A4_OUTPUT_DIRECTORY="$OUT/browser" A4_PHASE=reopen node --experimental-strip-types test/history-retention-new-records.integration.ts
fi
for mode in plain observe after-outcome before-outcome direct-after-outcome; do
  directory=$(mktemp -d "$OUT/crash-$mode-XXXXXXXX")
  hook=()
  expected=137
  if [[ "$mode" != plain ]]; then hook=(--import ./test/history-retention-runtime-hook.ts); fi
  if [[ "$mode" == plain || "$mode" == observe ]]; then expected=0; fi
  run "$expected" "$directory/create.log" env A4_DIAGNOSTIC_DIRECTORY="$directory" A4_FAULT="$mode" node --experimental-strip-types "${hook[@]}" test/history-retention-crash.integration.ts
  # All final recovery processes are uninstrumented, including the independent direct kill.
  run 0 "$directory/recover.log" env A4_DIAGNOSTIC_DIRECTORY="$directory" A4_PHASE=recover node --experimental-strip-types test/history-retention-crash.integration.ts
done
for boundary in after-repair after-outcome; do
  directory=$(mktemp -d "$OUT/crash-repair-$boundary-XXXXXXXX")
  run 137 "$directory/create.log" env A4_DIAGNOSTIC_DIRECTORY="$directory" A4_FAULT=before-outcome node --experimental-strip-types --import ./test/history-retention-runtime-hook.ts test/history-retention-crash.integration.ts
  run 137 "$directory/interrupted-recovery.log" env A4_DIAGNOSTIC_DIRECTORY="$directory" A4_PHASE=recover A4_FAULT="$boundary" node --experimental-strip-types --import ./test/history-retention-runtime-hook.ts test/history-retention-crash.integration.ts
  run 0 "$directory/recover.log" env A4_DIAGNOSTIC_DIRECTORY="$directory" A4_PHASE=recover node --experimental-strip-types test/history-retention-crash.integration.ts
done
for kind in silent explicit cancelled; do
  directory=$(mktemp -d "$OUT/overflow-$kind-XXXXXXXX")
  extra=()
  if [[ "$kind" == explicit ]]; then extra=(A4_OVERFLOW_ERROR=1); fi
  if [[ "$kind" == cancelled ]]; then extra=(A4_OVERFLOW_CANCEL=1); fi
  run 0 "$directory/create.log" env A4_DIAGNOSTIC_DIRECTORY="$directory" A4_OUTPUT_DIRECTORY="$directory" A4_OVERFLOW_PROBE=1 "${extra[@]}" node --experimental-strip-types --import ./test/history-retention-runtime-hook.ts test/history-retention.integration.ts
  run 0 "$directory/reopen.log" env A4_OUTPUT_DIRECTORY="$directory" A4_PHASE=reopen node --experimental-strip-types test/history-retention.integration.ts
done
run 0 "$OUT/audit.log" python3 test/history-retention-audit.py "$OUT" "$MODE"
printf 'Safety replay exit=%s; all failures retained in %s\n' "$failed" "$OUT"
exit "$failed"
