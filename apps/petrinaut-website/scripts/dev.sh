#!/usr/bin/env bash
# The website's dev task. With --with-optimizer-service it also builds and
# starts the local Petrinaut Optimizer, so the /optimization route runs studies
# for real; every other argument goes to Vite:
#
#   turbo run dev --filter @apps/petrinaut-website -- --with-optimizer-service
set -euo pipefail
cd "$(dirname "$0")/.."
. ../../libs/@local/petrinaut-optimizer-client/scripts/optimizer-service.sh
optimizer_service_parse "$@"
yarn examples:generate
# Vite is run by path: Yarn hides a dependency's bin from `yarn run` when the
# workspace also declares one of that dependency's peers (`@types/node` here),
# so `yarn vite` fails with "Couldn't find a script named vite".
vite_bin="$(node -p 'require("path").join(require("path").dirname(require.resolve("vite/package.json")), "bin", "vite.js")')"
run_dev_server node "$vite_bin" ${OPTIMIZER_FORWARDED[@]+"${OPTIMIZER_FORWARDED[@]}"}
