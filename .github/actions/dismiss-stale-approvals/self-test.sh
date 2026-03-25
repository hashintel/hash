#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel)"
ACTION_DIR="$REPO_ROOT/.github/actions/dismiss-stale-approvals"
ACTION_YML="$ACTION_DIR/action.yml"

# shellcheck disable=SC1091
source "$ACTION_DIR/latest_artifact.sh"
# shellcheck disable=SC1091
source "$ACTION_DIR/check-manual-merge-resolutions.sh"

fail() {
  echo "$*" >&2
  exit 1
}

assert_contains() {
  local haystack="$1"
  local needle="$2"

  [[ "$haystack" == *"$needle"* ]] || fail "Expected output to contain: $needle"$'\n'"Actual output:"$'\n'"$haystack"
}

create_repo() {
  local repo_path="$1"

  git init -q "$repo_path"
  git -C "$repo_path" config user.name "Codex"
  git -C "$repo_path" config user.email "codex@example.com"
}

test_collect_paginated_array() {
  local output
  output="$(
    printf '%s\n%s\n' \
      '{"workflow_runs":[{"id":1},{"id":2}]}' \
      '{"workflow_runs":[{"id":3}]}' |
      collect_paginated_array "workflow_runs"
  )"

  [[ "$output" == '[{"id":1},{"id":2},{"id":3}]' ]] ||
    fail "Expected flattened paginated array, got: $output"

  local workflow_id run_id artifact_id
  workflow_id="$(find_latest_workflow_id '[{"id":11,"name":"Other","updated_at":"2026-03-24T00:00:00Z"},{"id":22,"name":"Dismiss stale pull request approvals","updated_at":"2026-03-25T00:00:00Z"}]' 'Dismiss stale pull request approvals')"
  run_id="$(find_latest_workflow_run_id '[{"id":31,"run_number":8,"pull_requests":[{"number":8577}]},{"id":32,"run_number":9,"pull_requests":[{"number":8577}]},{"id":33,"run_number":10,"pull_requests":[{"number":9999}]}]' '8577')"
  artifact_id="$(find_latest_artifact_id '[{"id":41,"name":"other-artifact"},{"id":42,"name":"dismiss-stale-approvals-shas"}]' 'dismiss-stale-approvals-shas')"

  [[ "$workflow_id" == "22" ]] || fail "Expected latest workflow id 22, got: $workflow_id"
  [[ "$run_id" == "32" ]] || fail "Expected latest workflow run id 32, got: $run_id"
  [[ "$artifact_id" == "42" ]] || fail "Expected latest artifact id 42, got: $artifact_id"
}

test_rewritten_history_is_stale() {
  local repo_path
  repo_path="$(mktemp -d)"

  create_repo "$repo_path"

  printf 'base\n' >"$repo_path/file.txt"
  git -C "$repo_path" add file.txt
  git -C "$repo_path" commit -qm "base"

  printf 'approved\n' >"$repo_path/file.txt"
  git -C "$repo_path" commit -qam "approved"
  local approval_sha
  approval_sha="$(git -C "$repo_path" rev-parse HEAD)"

  git -C "$repo_path" reset --hard HEAD~1 >/dev/null

  printf 'rewritten\n' >"$repo_path/file.txt"
  git -C "$repo_path" commit -qam "rewritten"
  local head_sha
  head_sha="$(git -C "$repo_path" rev-parse HEAD)"

  local output
  output="$(run_check_manual_merge_resolutions "$repo_path" "$approval_sha" "$head_sha")"

  assert_contains "$output" "stale=true"
  assert_contains "$output" "rewritten history"

  rm -rf "$repo_path"
}

test_bare_repo_conflict_merge_is_stale() {
  local repo_path bare_repo_path
  repo_path="$(mktemp -d)"
  bare_repo_path="$(mktemp -d)"

  create_repo "$repo_path"

  printf 'base\n' >"$repo_path/file.txt"
  git -C "$repo_path" add file.txt
  git -C "$repo_path" commit -qm "base"

  local trunk_branch
  trunk_branch="$(git -C "$repo_path" branch --show-current)"

  git -C "$repo_path" checkout -qb feature
  printf 'feature\n' >"$repo_path/file.txt"
  git -C "$repo_path" commit -qam "feature change"
  local approval_sha
  approval_sha="$(git -C "$repo_path" rev-parse HEAD)"

  git -C "$repo_path" checkout -q "$trunk_branch"
  printf 'main\n' >"$repo_path/file.txt"
  git -C "$repo_path" commit -qam "main change"

  git -C "$repo_path" checkout -q feature
  if git -C "$repo_path" merge "$trunk_branch" >/dev/null 2>&1; then
    fail "Expected merge conflict"
  fi

  printf 'resolved\n' >"$repo_path/file.txt"
  git -C "$repo_path" add file.txt
  git -C "$repo_path" commit -qm "resolve conflict"
  local head_sha
  head_sha="$(git -C "$repo_path" rev-parse HEAD)"

  git clone --bare "$repo_path" "$bare_repo_path/repo.git" >/dev/null 2>&1

  local output
  output="$(run_check_manual_merge_resolutions "$bare_repo_path/repo.git" "$approval_sha" "$head_sha")"

  assert_contains "$output" "stale=true"
  assert_contains "$output" "file.txt"

  rm -rf "$repo_path" "$bare_repo_path"
}

test_action_wires_checker_to_fetched_repo() {
  if ! grep -Fq -- '--repository-path "$FETCHED_REPOSITORY_PATH"' "$ACTION_YML"; then
    fail 'Expected action.yml to pass the fetched repository path into check-manual-merge-resolutions.sh'
  fi
}

test_action_run_blocks_do_not_inline_github_context() {
  local offending_lines
  offending_lines="$(
    awk '
      /run: \|/ { in_run=1; next }
      in_run && /^[[:space:]]*-[[:space:]]name:/ { in_run=0 }
      in_run && /\$\{\{[[:space:]]*github\./ { print NR ":" $0 }
    ' "$ACTION_YML"
  )"

  if [[ -n "$offending_lines" ]]; then
    fail "Expected run blocks to avoid direct github.* interpolation"$'\n'"$offending_lines"
  fi
}

main() {
  test_collect_paginated_array
  test_rewritten_history_is_stale
  test_bare_repo_conflict_merge_is_stale
  test_action_wires_checker_to_fetched_repo
  test_action_run_blocks_do_not_inline_github_context

  echo "dismiss-stale-approvals self-test passed"
}

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
  main "$@"
fi
