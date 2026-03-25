#!/usr/bin/env bash
set -euo pipefail

approval_sha=""
head_sha=""

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
    *)
      echo "Unknown argument: $1" >&2
      exit 1
      ;;
  esac
done

if [[ -z "$approval_sha" || -z "$head_sha" ]]; then
  echo "stale=false"
  echo "reason="
  exit 0
fi

if ! git rev-parse --verify --quiet "$approval_sha^{commit}" >/dev/null; then
  echo "stale=false"
  echo "reason="
  exit 0
fi

if ! git rev-parse --verify --quiet "$head_sha^{commit}" >/dev/null; then
  echo "stale=false"
  echo "reason="
  exit 0
fi

if ! git merge-base --is-ancestor "$approval_sha" "$head_sha"; then
  echo "stale=false"
  echo "reason="
  exit 0
fi

while read -r merge_commit; do
  [[ -n "$merge_commit" ]] || continue

  if merge_tree_output="$(git merge-tree "${merge_commit}^1" "${merge_commit}^2" 2>&1)"; then
    merge_tree_status=0
  else
    merge_tree_status=$?
  fi

  if [[ $merge_tree_status -ne 0 && "$merge_tree_output" != *"CONFLICT"* ]]; then
    echo "merge-tree failed for ${merge_commit}: ${merge_tree_output}" >&2
    exit "$merge_tree_status"
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

  echo "stale=true"
  echo "merge_commit=$merge_commit"
  echo "conflict_files=$conflict_files"
  echo "reason=$reason"
  exit 0
done < <(git rev-list --merges "${approval_sha}..${head_sha}")

echo "stale=false"
echo "reason="
