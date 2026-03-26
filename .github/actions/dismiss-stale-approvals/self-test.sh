#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel)"
ACTION_DIR="$REPO_ROOT/.github/actions/dismiss-stale-approvals"
ACTION_YML="$ACTION_DIR/action.yml"

# shellcheck disable=SC1091
source "$ACTION_DIR/latest-artifact.sh"
# shellcheck disable=SC1091
source "$ACTION_DIR/latest-approval-sha.sh"
# shellcheck disable=SC1091
source "$ACTION_DIR/decide-stale-approvals.sh"
# shellcheck disable=SC1091
source "$ACTION_DIR/check-manual-merge-resolutions.sh"
# shellcheck disable=SC1091
source "$ACTION_DIR/range-diff-stale.sh"

TEMP_PATHS=()

register_temp_path() {
  TEMP_PATHS+=("$1")
}

cleanup_temp_paths() {
  local temp_path

  for temp_path in "${TEMP_PATHS[@]}"; do
    [[ -e "$temp_path" ]] && rm -rf "$temp_path"
  done
}

trap cleanup_temp_paths EXIT

fail() {
  echo "$*" >&2
  exit 1
}

assert_contains() {
  local haystack="$1"
  local needle="$2"

  [[ "$haystack" == *"$needle"* ]] || fail "Expected output to contain: $needle"$'\n'"Actual output:"$'\n'"$haystack"
}

assert_not_contains() {
  local haystack="$1"
  local needle="$2"

  [[ "$haystack" != *"$needle"* ]] || fail "Expected output not to contain: $needle"$'\n'"Actual output:"$'\n'"$haystack"
}

create_repo() {
  local repo_path="$1"

  git init -q "$repo_path"
  git -C "$repo_path" config user.name "Codex"
  git -C "$repo_path" config user.email "codex@example.com"
}

extract_step_block() {
  local step_name="$1"

  awk -v step_name="$step_name" '
    $0 ~ "^[[:space:]]*-[[:space:]]name:[[:space:]]*" step_name "$" {
      if (seen_step) {
        exit
      }
      capture=1
    }
    capture {
      if ($0 ~ "^[[:space:]]*-[[:space:]]name:[[:space:]]*" && $0 !~ step_name && seen_step) {
        exit
      }
      print
      seen_step=1
    }
  ' "$ACTION_YML"
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

  artifact_id="$(find_latest_artifact_id '[{"id":51,"name":"dismiss-stale-approvals-shas","created_at":"2026-03-24T00:00:00Z"},{"id":52,"name":"dismiss-stale-approvals-shas","created_at":"2026-03-25T00:00:00Z"}]' 'dismiss-stale-approvals-shas')"
  [[ "$artifact_id" == "52" ]] || fail "Expected newest duplicate artifact id 52, got: $artifact_id"

  artifact_id="$(find_latest_artifact_id '[{"id":61,"name":"other-artifact","created_at":"2026-03-25T00:00:00Z"}]' 'dismiss-stale-approvals-shas')"
  [[ "$artifact_id" == "null" ]] || fail "Expected null when no artifact matches, got: $artifact_id"
}

test_collect_paginated_reviews() {
  local reviews_json latest_approval_sha
  reviews_json="$(
    printf '%s\n%s\n' \
      '[{"state":"APPROVED","commit_id":"sha-newest","submitted_at":"2026-03-25T12:00:00Z"},{"state":"COMMENTED","commit_id":"ignore-comment","submitted_at":"2026-03-25T13:00:00Z"}]' \
      '[{"state":"APPROVED","commit_id":"sha-oldest","submitted_at":"2026-03-24T12:00:00Z"},{"state":"CHANGES_REQUESTED","commit_id":"ignore-change-request","submitted_at":"2026-03-25T14:00:00Z"}]' |
      collect_paginated_reviews
  )"

  [[ "$reviews_json" == '[{"state":"APPROVED","commit_id":"sha-newest","submitted_at":"2026-03-25T12:00:00Z"},{"state":"COMMENTED","commit_id":"ignore-comment","submitted_at":"2026-03-25T13:00:00Z"},{"state":"APPROVED","commit_id":"sha-oldest","submitted_at":"2026-03-24T12:00:00Z"},{"state":"CHANGES_REQUESTED","commit_id":"ignore-change-request","submitted_at":"2026-03-25T14:00:00Z"}]' ]] ||
    fail "Expected flattened paginated reviews array, got: $reviews_json"

  latest_approval_sha="$(find_latest_approval_sha "$reviews_json")"
  [[ "$latest_approval_sha" == "sha-newest" ]] ||
    fail "Expected latest approval SHA sha-newest, got: $latest_approval_sha"

  latest_approval_sha="$(find_latest_approval_sha '[{"state":"COMMENTED","commit_id":"ignore","submitted_at":"2026-03-25T12:00:00Z"},{"state":"CHANGES_REQUESTED","commit_id":"ignore-change-request","submitted_at":"2026-03-25T13:00:00Z"}]')"
  [[ -z "$latest_approval_sha" ]] ||
    fail "Expected no approval SHA when there are no approved reviews, got: $latest_approval_sha"
}

test_empty_range_diff_is_not_stale() {
  local output

  output="$(printf '' | run_range_diff_stale)"
  [[ "$output" == "stale=false" ]] ||
    fail "Expected an empty range-diff output to keep stale=false, got: $output"

  output="$(printf '%s\n' '1: abcdef = 1: abcdef' | run_range_diff_stale)"
  [[ "$output" == "stale=false" ]] ||
    fail "Expected an unchanged range-diff entry to keep stale=false, got: $output"

  output="$(printf '%s\n' '1: abcdef < 1: fedcba' | run_range_diff_stale)"
  [[ "$output" == "stale=true" ]] ||
    fail "Expected a changed range-diff entry to set stale=true, got: $output"
}

test_no_approval_is_not_stale() {
  local repo_path output
  repo_path="$(mktemp -d)"
  register_temp_path "$repo_path"

  create_repo "$repo_path"

  printf 'base\n' >"$repo_path/file.txt"
  git -C "$repo_path" add file.txt
  git -C "$repo_path" commit -qm "base"

  output="$(run_check_manual_merge_resolutions "$repo_path" "" "$(git -C "$repo_path" rev-parse HEAD)")"

  assert_contains "$output" "stale=false"
}

test_decision_marks_approval_lookup_failure_stale() {
  local output
  output="$(run_decide_stale_approvals "failure" "success" "false" "" "success" "false" "0" "https://example.test/run")"

  assert_contains "$output" "stale=true"
  assert_contains "$output" "Failed to read latest approval SHA"
}

test_decision_keeps_successful_no_approval_path_safe() {
  local output
  output="$(run_decide_stale_approvals "success" "success" "false" "" "success" "false" "0" "https://example.test/run")"

  [[ "$output" == $'stale=false\nreason=' ]] ||
    fail "Expected a successful no-approval decision to stay non-stale, got:"$'\n'"$output"
}

test_rewritten_history_is_stale() {
  local repo_path
  repo_path="$(mktemp -d)"
  register_temp_path "$repo_path"

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
}

test_rev_list_failure_returns_nonzero() {
  local repo_path output status
  repo_path="$(mktemp -d)"
  register_temp_path "$repo_path"

  create_repo "$repo_path"

  printf 'base\n' >"$repo_path/file.txt"
  git -C "$repo_path" add file.txt
  git -C "$repo_path" commit -qm "base"

  printf 'approved\n' >"$repo_path/file.txt"
  git -C "$repo_path" commit -qam "approved"
  local approval_sha
  approval_sha="$(git -C "$repo_path" rev-parse HEAD)"

  printf 'head\n' >"$repo_path/file.txt"
  git -C "$repo_path" commit -qam "head"
  local head_sha
  head_sha="$(git -C "$repo_path" rev-parse HEAD)"

  run_git() {
    local repository_path="$1"
    shift

    if [[ "$1" == "rev-list" ]]; then
      echo "forced rev-list failure" >&2
      return 42
    fi

    git -C "$repository_path" "$@"
  }

  if output="$(run_check_manual_merge_resolutions "$repo_path" "$approval_sha" "$head_sha" 2>/dev/null)"; then
    status=0
  else
    status=$?
  fi

  # shellcheck disable=SC1091
  source "$ACTION_DIR/check-manual-merge-resolutions.sh"

  [[ $status -ne 0 ]] || fail "Expected rev-list failure to propagate as non-zero, got output:"$'\n'"$output"
}

test_missing_approval_commit_is_stale() {
  local repo_path bare_repo_path shallow_repo_path
  repo_path="$(mktemp -d)"
  bare_repo_path="$(mktemp -d)"
  shallow_repo_path="$(mktemp -d)"
  register_temp_path "$repo_path"
  register_temp_path "$bare_repo_path"
  register_temp_path "$shallow_repo_path"

  create_repo "$repo_path"

  printf '0\n' >"$repo_path/file.txt"
  git -C "$repo_path" add file.txt
  git -C "$repo_path" commit -qm "base"

  printf '1\n' >"$repo_path/file.txt"
  git -C "$repo_path" commit -qam "approved"
  local approval_sha
  approval_sha="$(git -C "$repo_path" rev-parse HEAD)"

  printf '2\n' >"$repo_path/file.txt"
  git -C "$repo_path" commit -qam "head"
  local head_sha
  head_sha="$(git -C "$repo_path" rev-parse HEAD)"

  git clone --bare "$repo_path" "$bare_repo_path/repo.git" >/dev/null 2>&1
  git init -q --bare "$shallow_repo_path/repo.git"
  git -C "$shallow_repo_path/repo.git" remote add origin "$bare_repo_path/repo.git"
  git -C "$shallow_repo_path/repo.git" fetch -q origin --depth=1 "$head_sha"

  local output
  output="$(run_check_manual_merge_resolutions "$shallow_repo_path/repo.git" "$approval_sha" "$head_sha")"

  assert_contains "$output" "stale=true"
  assert_contains "$output" "not available in fetched repository state"
}

test_bare_repo_conflict_merge_is_stale() {
  local repo_path bare_repo_path
  repo_path="$(mktemp -d)"
  bare_repo_path="$(mktemp -d)"
  register_temp_path "$repo_path"
  register_temp_path "$bare_repo_path"

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
}

test_action_wires_checker_to_fetched_repo() {
  if ! grep -Fq -- "--repository-path \"\$FETCHED_REPOSITORY_PATH\"" "$ACTION_YML"; then
    fail 'Expected action.yml to pass the fetched repository path into check-manual-merge-resolutions.sh'
  fi
}

test_action_uses_shared_range_diff_helper() {
  if ! grep -Fq -- 'range-diff-stale.sh' "$ACTION_YML"; then
    fail 'Expected action.yml to delegate range-diff parsing to range-diff-stale.sh'
  fi
}

test_action_reads_latest_approval_sha_via_helper() {
  if ! grep -Fq -- 'latest-approval-sha.sh' "$ACTION_YML"; then
    fail 'Expected action.yml to read the latest approval SHA via latest-approval-sha.sh'
  fi

  if ! grep -Fq -- "\"\$APPROVAL_SHA\"" "$ACTION_YML"; then
    fail 'Expected action.yml to fetch or pass the latest approval SHA explicitly'
  fi
}

test_hyphenated_helpers_exist_and_are_executable() {
  local helper_path

  for helper_path in \
    "$ACTION_DIR/decide-stale-approvals.sh" \
    "$ACTION_DIR/latest-approval-sha.sh" \
    "$ACTION_DIR/latest-artifact.sh" \
    "$ACTION_DIR/range-diff-stale.sh"; do
    [[ -x "$helper_path" ]] || fail "Expected helper to exist and be executable: $helper_path"
  done
}

test_action_continues_after_approval_lookup_failure() {
  local approval_block
  approval_block="$(extract_step_block "Read latest approval SHA")"

  [[ "$approval_block" == *"continue-on-error: true"* ]] ||
    fail "Expected the approval lookup step to continue on error"$'\n'"$approval_block"
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

test_action_uses_github_env_shas_without_redeclaring_them() {
  local range_diff_block merge_tree_block
  range_diff_block="$(extract_step_block "Check if diff has changed")"
  merge_tree_block="$(extract_step_block "Check for manual merge resolutions after approval")"

  if grep -Eq '^[[:space:]]+BASE_SHA:' <<<"$range_diff_block"; then
    fail "Expected the range-diff step to read BASE_SHA from GITHUB_ENV"$'\n'"$range_diff_block"
  fi

  if grep -Eq '^[[:space:]]+HEAD_SHA:' <<<"$range_diff_block"; then
    fail "Expected the range-diff step to read HEAD_SHA from GITHUB_ENV"$'\n'"$range_diff_block"
  fi

  if grep -Eq '^[[:space:]]+HEAD_SHA:' <<<"$merge_tree_block"; then
    fail "Expected the merge-tree step to read HEAD_SHA from GITHUB_ENV"$'\n'"$merge_tree_block"
  fi
}

main() {
  test_collect_paginated_array
  test_collect_paginated_reviews
  test_empty_range_diff_is_not_stale
  test_no_approval_is_not_stale
  test_decision_marks_approval_lookup_failure_stale
  test_decision_keeps_successful_no_approval_path_safe
  test_rewritten_history_is_stale
  test_rev_list_failure_returns_nonzero
  test_missing_approval_commit_is_stale
  test_bare_repo_conflict_merge_is_stale
  test_action_uses_shared_range_diff_helper
  test_action_wires_checker_to_fetched_repo
  test_action_reads_latest_approval_sha_via_helper
  test_hyphenated_helpers_exist_and_are_executable
  test_action_continues_after_approval_lookup_failure
  test_action_run_blocks_do_not_inline_github_context
  test_action_uses_github_env_shas_without_redeclaring_them

  echo "dismiss-stale-approvals self-test passed"
}

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
  main "$@"
fi
