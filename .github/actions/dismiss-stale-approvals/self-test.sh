#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel)"
ACTION_DIR="$REPO_ROOT/.github/actions/dismiss-stale-approvals"
ACTION_YML="$ACTION_DIR/action.yml"

# shellcheck disable=SC1091
source "$ACTION_DIR/latest_artifact.sh"
# shellcheck disable=SC1091
source "$ACTION_DIR/latest_approval_sha.sh"
# shellcheck disable=SC1091
source "$ACTION_DIR/decide_stale_approvals.sh"
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

range_diff_marks_stale() {
  local range_diff="$1"

  if printf '%s\n' "$range_diff" | awk 'NF >= 3 { print $3 }' | grep -vq '^=$'; then
    return 0
  fi

  return 1
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
  if range_diff_marks_stale ""; then
    fail "Expected an empty range-diff output to keep stale=false"
  fi

  if range_diff_marks_stale $'1: abcdef = 1: abcdef'; then
    fail "Expected an unchanged range-diff entry to keep stale=false"
  fi

  if ! range_diff_marks_stale $'1: abcdef < 1: fedcba'; then
    fail "Expected a changed range-diff entry to set stale=true"
  fi
}

test_no_approval_is_not_stale() {
  local repo_path output
  repo_path="$(mktemp -d)"

  create_repo "$repo_path"

  printf 'base\n' >"$repo_path/file.txt"
  git -C "$repo_path" add file.txt
  git -C "$repo_path" commit -qm "base"

  output="$(run_check_manual_merge_resolutions "$repo_path" "" "$(git -C "$repo_path" rev-parse HEAD)")"

  assert_contains "$output" "stale=false"

  rm -rf "$repo_path"
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

test_missing_approval_commit_is_stale() {
  local repo_path bare_repo_path shallow_repo_path
  repo_path="$(mktemp -d)"
  bare_repo_path="$(mktemp -d)"
  shallow_repo_path="$(mktemp -d)"

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

  rm -rf "$repo_path" "$bare_repo_path" "$shallow_repo_path"
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
  if ! grep -Fq -- "--repository-path \"\$FETCHED_REPOSITORY_PATH\"" "$ACTION_YML"; then
    fail 'Expected action.yml to pass the fetched repository path into check-manual-merge-resolutions.sh'
  fi
}

test_action_reads_latest_approval_sha_via_helper() {
  if ! grep -Fq -- 'latest_approval_sha.sh' "$ACTION_YML"; then
    fail 'Expected action.yml to read the latest approval SHA via latest_approval_sha.sh'
  fi

  if ! grep -Fq -- "\"\$APPROVAL_SHA\"" "$ACTION_YML"; then
    fail 'Expected action.yml to fetch or pass the latest approval SHA explicitly'
  fi
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

main() {
  test_collect_paginated_array
  test_collect_paginated_reviews
  test_empty_range_diff_is_not_stale
  test_no_approval_is_not_stale
  test_decision_marks_approval_lookup_failure_stale
  test_decision_keeps_successful_no_approval_path_safe
  test_rewritten_history_is_stale
  test_missing_approval_commit_is_stale
  test_bare_repo_conflict_merge_is_stale
  test_action_wires_checker_to_fetched_repo
  test_action_reads_latest_approval_sha_via_helper
  test_action_continues_after_approval_lookup_failure
  test_action_run_blocks_do_not_inline_github_context

  echo "dismiss-stale-approvals self-test passed"
}

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
  main "$@"
fi
