#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel)"
WORKFLOW="$REPO_ROOT/.github/workflows/dismiss-stale-approvals.yml"

if ! grep -Fq "uses: ./.github/actions/dismiss-stale-approvals" "$WORKFLOW"; then
  echo "Expected workflow to use the local dismiss-stale-approvals action" >&2
  exit 1
fi

if grep -Fq "turnage/dismiss-stale-approvals" "$WORKFLOW"; then
  echo "Expected workflow to stop using the external dismiss-stale-approvals fork" >&2
  exit 1
fi

echo "dismiss-stale-approvals workflow wiring test passed"
