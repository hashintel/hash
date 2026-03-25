#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel)"
CHECKER="$REPO_ROOT/.github/actions/dismiss-stale-approvals/check-manual-merge-resolutions.sh"

assert_contains() {
  local haystack="$1"
  local needle="$2"

  if [[ "$haystack" != *"$needle"* ]]; then
    echo "Expected output to contain: $needle" >&2
    echo "Actual output:" >&2
    echo "$haystack" >&2
    exit 1
  fi
}

conflict_output="$(bash "$CHECKER" \
  --approval-sha 97eac95dea82e81141c548b31df863a1166441fa \
  --head-sha df5c231e39efd6d26939d92949fc1fd8f48af664)"

assert_contains "$conflict_output" "stale=true"
assert_contains "$conflict_output" "df5c231e39efd6d26939d92949fc1fd8f48af664"
assert_contains "$conflict_output" "apps/hash-graph/src/subcommand/admin_server.rs"
assert_contains "$conflict_output" "libs/@local/graph/api/src/rest/admin.rs"

clean_output="$(bash "$CHECKER" \
  --approval-sha cf3828778ad8727e615b1350e10e80ba89ed016b \
  --head-sha b72403e0cfcc79d2b81f7aaea0e506f242eeb97f)"

assert_contains "$clean_output" "stale=false"

echo "check-manual-merge-resolutions.sh tests passed"
