#!/usr/bin/env bash
# Run after the offline app build and website build with VITE_BRUNCH_CHAT_ENDPOINT=/agents/chat.
# Each run creates its own stores. No JSON import, provider request or dependency modification.
set -euo pipefail
ROOT=$(git rev-parse --show-toplevel)
BASE=${1:-"$ROOT/libs/@hashintel/brunch-agent/docs/evidence/implementations/fe-1573-step-a"}
OUT=$(mktemp -d "$BASE/a4-replay-XXXXXXXX")
printf '%s\n' "$OUT"
export YARN_ENABLE_NETWORK=0 COREPACK_ENABLE_NETWORK=0 CARGO_NET_OFFLINE=true OTEL_SDK_DISABLED=true
unset HASH_OTLP_ENDPOINT
cd "$ROOT/apps/brunch-agent"
run() {
  local log=$1
  shift
  printf '%q ' "$@" >> "$OUT/commands.log"
  printf '\n' >> "$OUT/commands.log"
  local code=0
  "$@" > "$log" 2>&1 || code=$?
  printf 'exit=%s log=%s\n' "$code" "$log" >> "$OUT/commands.log"
  return "$code"
}
run "$OUT/browser.log" env M7_BROWSER_OUTPUT="$OUT/browser" node --experimental-strip-types test/transition-records.integration.ts
run "$OUT/fold.log" env A4_OUTPUT_DIRECTORY="$OUT/browser" node --experimental-strip-types test/history-retention-new-records.integration.ts
run "$OUT/reopen.log" env A4_OUTPUT_DIRECTORY="$OUT/browser" A4_PHASE=reopen node --experimental-strip-types test/history-retention-new-records.integration.ts
for mode in observe after-outcome before-outcome; do
  directory=$(mktemp -d "$OUT/crash-$mode-XXXXXXXX")
  code=0
  run "$directory/create.log" env A4_DIAGNOSTIC_DIRECTORY="$directory" A4_FAULT="$mode" node --experimental-strip-types --import ./test/history-retention-runtime-hook.ts test/history-retention-crash.integration.ts || code=$?
  if [[ "$mode" == observe ]]; then test "$code" = 0; else test "$code" = 137; fi
  run "$directory/recover.log" env A4_DIAGNOSTIC_DIRECTORY="$directory" A4_PHASE=recover A4_FAULT=observe node --experimental-strip-types --import ./test/history-retention-runtime-hook.ts test/history-retention-crash.integration.ts
done
directory=$(mktemp -d "$OUT/crash-repair-XXXXXXXX")
code=0
run "$directory/create.log" env A4_DIAGNOSTIC_DIRECTORY="$directory" A4_FAULT=before-outcome node --experimental-strip-types --import ./test/history-retention-runtime-hook.ts test/history-retention-crash.integration.ts || code=$?
test "$code" = 137
code=0
run "$directory/interrupted-recovery.log" env A4_DIAGNOSTIC_DIRECTORY="$directory" A4_PHASE=recover A4_FAULT=after-repair node --experimental-strip-types --import ./test/history-retention-runtime-hook.ts test/history-retention-crash.integration.ts || code=$?
test "$code" = 137
run "$directory/recover.log" env A4_DIAGNOSTIC_DIRECTORY="$directory" A4_PHASE=recover node --experimental-strip-types test/history-retention-crash.integration.ts
directory=$(mktemp -d "$OUT/overflow-XXXXXXXX")
code=0
run "$directory/create.log" env A4_DIAGNOSTIC_DIRECTORY="$directory" A4_OUTPUT_DIRECTORY="$directory" A4_OVERFLOW_PROBE=1 node --experimental-strip-types --import ./test/history-retention-runtime-hook.ts test/history-retention.integration.ts || code=$?
test "$code" = 1
run "$OUT/audit.log" python3 test/history-retention-audit.py "$OUT"
printf 'Probes completed, including expected failures. Inspect observations; this is not a safety verdict.\n'
