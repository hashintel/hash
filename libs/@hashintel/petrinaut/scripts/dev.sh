#!/usr/bin/env bash
# Petrinaut's dev task: Storybook, with the editor built from source. Every
# argument goes to Storybook.
set -euo pipefail
cd "$(dirname "$0")/.."
exec yarn storybook dev -p "${PORT:-6006}" "$@"
