#!/usr/bin/env bash
set -euo pipefail

run_range_diff_stale() {
  local range_diff
  range_diff="$(cat)"

  if printf '%s\n' "$range_diff" | awk 'NF >= 3 { print $3 }' | grep -vq '^=$'; then
    printf 'stale=true\n'
  else
    printf 'stale=false\n'
  fi
}

main() {
  run_range_diff_stale
}

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
  main "$@"
fi
