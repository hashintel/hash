#!/usr/bin/env bash
set -euo pipefail

run_decide_stale_approvals() {
  local approval_outcome="$1"
  local merge_tree_outcome="$2"
  local merge_tree_stale="$3"
  local merge_tree_reason="$4"
  local range_diff_outcome="$5"
  local range_diff_stale="$6"
  local no_prev_shas="$7"
  local workflow_run_url="$8"

  local stale="false"
  local reason=""

  if [[ "$approval_outcome" != "success" ]]; then
    stale="true"
    reason="Failed to read latest approval SHA; see action logs at $workflow_run_url"
  elif [[ "$merge_tree_outcome" != "success" ]]; then
    stale="true"
    reason="Failed to check whether merge commits after approval required manual conflict resolution; see action logs at $workflow_run_url"
  elif [[ "$merge_tree_stale" == "true" ]]; then
    stale="true"
    reason="$merge_tree_reason"
  elif [[ "$range_diff_outcome" != "success" ]]; then
    stale="true"
    reason="Failed to check if diff has changed; see action logs at $workflow_run_url"
  elif [[ "$no_prev_shas" == "1" ]]; then
    stale="true"
    reason="Could not find data on the previous version of this PR; see action logs at $workflow_run_url"
  elif [[ "$range_diff_stale" == "true" ]]; then
    stale="true"
    reason="See the output of \`git range-diff\` at $workflow_run_url"
  fi

  printf 'stale=%s\n' "$stale"
  printf 'reason=%s\n' "$reason"
}

main() {
  local approval_outcome=""
  local merge_tree_outcome=""
  local merge_tree_stale=""
  local merge_tree_reason=""
  local range_diff_outcome=""
  local range_diff_stale=""
  local no_prev_shas="0"
  local workflow_run_url=""

  while [[ $# -gt 0 ]]; do
    case "$1" in
      --approval-outcome)
        approval_outcome="$2"
        shift 2
        ;;
      --merge-tree-outcome)
        merge_tree_outcome="$2"
        shift 2
        ;;
      --merge-tree-stale)
        merge_tree_stale="$2"
        shift 2
        ;;
      --merge-tree-reason)
        merge_tree_reason="$2"
        shift 2
        ;;
      --range-diff-outcome)
        range_diff_outcome="$2"
        shift 2
        ;;
      --range-diff-stale)
        range_diff_stale="$2"
        shift 2
        ;;
      --no-prev-shas)
        no_prev_shas="$2"
        shift 2
        ;;
      --workflow-run-url)
        workflow_run_url="$2"
        shift 2
        ;;
      *)
        echo "Unknown argument: $1" >&2
        exit 1
        ;;
    esac
  done

  run_decide_stale_approvals \
    "$approval_outcome" \
    "$merge_tree_outcome" \
    "$merge_tree_stale" \
    "$merge_tree_reason" \
    "$range_diff_outcome" \
    "$range_diff_stale" \
    "$no_prev_shas" \
    "$workflow_run_url"
}

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
  main "$@"
fi
