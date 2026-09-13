#!/usr/bin/env bash
# The website's dev task: regenerates the example artifacts, then starts Vite.
# Every argument goes to Vite:
#
#   turbo run dev --filter @apps/petrinaut-website -- --port 5175 --strictPort
set -euo pipefail
cd "$(dirname "$0")/.."
yarn examples:generate
# Vite is run by path: Yarn hides a dependency's bin from `yarn run` when the
# workspace also declares one of that dependency's peers (`@types/node` here),
# so `yarn vite` fails with "Couldn't find a script named vite".
vite_bin="$(node -p 'require("path").join(require("path").dirname(require.resolve("vite/package.json")), "bin", "vite.js")')"
exec node "$vite_bin" "$@"
