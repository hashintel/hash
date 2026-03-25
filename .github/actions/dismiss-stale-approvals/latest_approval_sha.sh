#!/usr/bin/env bash
set -euo pipefail

collect_paginated_reviews() {
  jq -sc 'add'
}

find_latest_approval_sha() {
  local reviews_json="$1"

  jq -r '[.[] | select(.state=="APPROVED" and (.commit_id // empty != empty))] | last | .commit_id // empty' <<<"$reviews_json"
}

main() {
  local repository="$1"
  local pr_number="$2"
  local reviews_json

  reviews_json="$(gh api --paginate "/repos/${repository}/pulls/${pr_number}/reviews" | collect_paginated_reviews)"
  find_latest_approval_sha "$reviews_json"
}

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
  main "$@"
fi
