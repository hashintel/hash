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
run_dev_server yarn vite ${OPTIMIZER_FORWARDED[@]+"${OPTIMIZER_FORWARDED[@]}"}
