#!/usr/bin/env bash
set -euo pipefail

repository=""
pr_number=""
reason=""
dry_run="false"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --repository)
      repository="$2"
      shift 2
      ;;
    --pr-number)
      pr_number="$2"
      shift 2
      ;;
    --reason)
      reason="$2"
      shift 2
      ;;
    --dry-run)
      dry_run="$2"
      shift 2
      ;;
    *)
      echo "Unknown argument: $1" >&2
      exit 1
      ;;
  esac
done

review_ids="$(gh api --paginate "repos/${repository}/pulls/${pr_number}/reviews" \
  --jq '.[] | select(.state=="APPROVED") | .id')"

if [[ -z "$review_ids" ]]; then
  echo "No approvals to dismiss"
  exit 0
fi

if [[ "$dry_run" =~ ^(true|1|yes)$ ]]; then
  gh pr comment "$pr_number" --repo "$repository" --body "$reason" >/dev/null
  echo "[dry-run] Commented on PR ${pr_number} instead of dismissing approvals"
  exit 0
fi

while read -r review_id; do
  [[ -n "$review_id" ]] || continue

  gh api \
    --method PUT \
    "repos/${repository}/pulls/${pr_number}/reviews/${review_id}/dismissals" \
    -f message="$reason" >/dev/null
done <<< "$review_ids"
