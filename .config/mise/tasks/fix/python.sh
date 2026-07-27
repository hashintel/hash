#!/usr/bin/env bash
#MISE description="Fix Python: sync lockfile, apply ruff autofixes and formatting"
set -euo pipefail

mise exec uv -- uv sync
mise exec uv -- uv run --frozen ruff check --fix .
mise exec uv -- uv run --frozen ruff format .
