#!/usr/bin/env bash
set -euo pipefail

run_git() {
  local repository_path="$1"
  shift

  git -C "$repository_path" "$@"
}

run_check_manual_merge_resolutions() {
  local repository_path="$1"
  local approval_sha="$2"
  local head_sha="$3"

  if [[ -z "$approval_sha" || -z "$head_sha" ]]; then
    printf 'stale=false\nreason=\n'
    return 0
  fi

  if ! run_git "$repository_path" rev-parse --verify --quiet "$approval_sha^{commit}" >/dev/null; then
    printf 'stale=true\n'
    printf 'reason=Latest approval commit %s is not available in fetched repository state\n' "$approval_sha"
    return 0
  fi

  if ! run_git "$repository_path" rev-parse --verify --quiet "$head_sha^{commit}" >/dev/null; then
    echo "head commit ${head_sha} is not available in fetched repository state" >&2
    return 1
  fi

  if ! run_git "$repository_path" merge-base --is-ancestor "$approval_sha" "$head_sha"; then
    printf 'stale=true\n'
    printf 'reason=Latest approval commit %s is not an ancestor of %s, indicating rewritten history after approval\n' "$approval_sha" "$head_sha"
    return 0
  fi

  local merge_commit merge_tree_output merge_tree_status conflict_files reason

  while read -r merge_commit; do
    [[ -n "$merge_commit" ]] || continue

    if merge_tree_output="$(run_git "$repository_path" merge-tree "${merge_commit}^1" "${merge_commit}^2" 2>&1)"; then
      merge_tree_status=0
    else
      merge_tree_status=$?
    fi

    if [[ $merge_tree_status -ne 0 && "$merge_tree_output" != *"CONFLICT"* ]]; then
      echo "merge-tree failed for ${merge_commit}: ${merge_tree_output}" >&2
      return "$merge_tree_status"
    fi

    if [[ "$merge_tree_output" != *"CONFLICT"* ]]; then
      continue
    fi

    conflict_files="$(
      {
        printf '%s\n' "$merge_tree_output" | awk '/^CONFLICT / { sub(/^.* Merge conflict in /, ""); print }'
        printf '%s\n' "$merge_tree_output" | awk '$3 ~ /^[123]$/ { print $4 }'
      } | awk 'NF > 0' | sort -u | paste -sd, -
    )"

    reason="Manual conflict resolution detected after approval in merge commit ${merge_commit}"
    if [[ -n "$conflict_files" ]]; then
      reason="${reason} for files: ${conflict_files}"
    fi

    printf 'stale=true\n'
    printf 'merge_commit=%s\n' "$merge_commit"
    printf 'conflict_files=%s\n' "$conflict_files"
    printf 'reason=%s\n' "$reason"
    return 0
  done < <(run_git "$repository_path" rev-list --merges "${approval_sha}..${head_sha}")

  printf 'stale=false\nreason=\n'
}

main() {
  local approval_sha=""
  local head_sha=""
  local repository_path="."

  while [[ $# -gt 0 ]]; do
    case "$1" in
      --approval-sha)
        approval_sha="$2"
        shift 2
        ;;
      --head-sha)
        head_sha="$2"
        shift 2
        ;;
      --repository-path)
        repository_path="$2"
        shift 2
        ;;
      *)
        echo "Unknown argument: $1" >&2
        exit 1
        ;;
    esac
  done

  run_check_manual_merge_resolutions "$repository_path" "$approval_sha" "$head_sha"
}

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
  main "$@"
fi
