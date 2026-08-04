#!/usr/bin/env bash
#MISE description="Synchronize Python workspace membership, version bounds, and generated package.json wiring"
set -euo pipefail

# Unfrozen on purpose: this is a fix task, so a stale uv.lock is expected
# input. `uv run` refreshes the lock and environment before running the tool.
mise exec uv -- uv run repo-chores sync
# Membership or dependency fixes change the workspace graph; refresh the lock
# and environment again so the result is immediately usable.
mise exec uv -- uv lock
mise exec uv -- uv sync --all-packages
