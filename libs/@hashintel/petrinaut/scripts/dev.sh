#!/usr/bin/env bash
# Petrinaut's dev task: Storybook, with the editor built from source. With
# --with-optimizer-service it also builds and starts the local Petrinaut
# Optimizer, so the "With real optimizer" story runs studies for real; every
# other argument goes to Storybook:
#
#   turbo run dev --filter @hashintel/petrinaut -- --with-optimizer-service
set -euo pipefail
cd "$(dirname "$0")/.."
. ../../@local/petrinaut-optimizer-client/scripts/optimizer-service.sh
optimizer_service_parse "$@"
run_dev_server yarn storybook dev -p "${PORT:-6006}" ${OPTIMIZER_FORWARDED[@]+"${OPTIMIZER_FORWARDED[@]}"}
