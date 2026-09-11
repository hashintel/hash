#!/usr/bin/env bash
# The website's dev task: regenerates the example artifacts, then starts Vite.
# Every argument goes to Vite:
#
#   turbo run dev --filter @apps/petrinaut-website -- --port 5175 --strictPort
set -euo pipefail
cd "$(dirname "$0")/.."
yarn examples:generate
exec yarn vite "$@"
