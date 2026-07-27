#!/usr/bin/env bash
#MISE description="Lint Python: lock stability, workspace sync, ruff format + lint, ty type checks, tach architecture checks"
set -uo pipefail

FAILED=0

run() {
    echo "$ $*"
    mise exec uv -- "$@" || FAILED=1
}

# `--locked` doubles as the uv.lock stability check: it fails if the lockfile
# is out of sync with the workspace manifests.
run uv sync --locked
# Boundaries: explicit workspace membership, uniform requires-python, shared
# tool pins, and generated package.json turbo wiring.
run uv run --frozen repo-chores sync --check
# Dependency rules: fully bounded version ranges, registry-only sources.
run uv run --frozen repo-chores lint
run uv run --frozen ruff format --check .
run uv run --frozen ruff check .
run uv run --frozen ty check
run uv run --frozen tach check
run uv run --frozen tach check-external

exit "$FAILED"
