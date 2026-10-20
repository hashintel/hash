#!/usr/bin/env bash

set -euo pipefail

eval "$(mise activate bash --shims)"

echo "Changing dir to root"
cd ../..

# TODO: Mise is picking up `.env` files. We need to overhaul our approach for
#   environment variables. To avoid this in the meantime, we'll remove the
#   `.env` file.
# See: https://linear.app/hash/issue/H-3213/use-consistent-naming-schema-for-environment-variables
# See: https://linear.app/hash/issue/H-4202/sort-out-which-environment-variables-are-defined-where
# See: https://linear.app/hash/issue/H-3212/clean-up-env-files
rm .env

echo "Building Petrinaut website"
turbo build --filter='@apps/petrinaut-website' --env-mode=loose

# Flows editor prototype branch only: Vercel builds of this one branch also
# ship the prototype page at /flows-editor-prototype/. Every other branch,
# main included, builds exactly as before.
if [ "${VERCEL_GIT_COMMIT_REF:-}" = "as/des-233-flows-editor-prototype" ]; then
  echo "Building the Flows editor prototype page"
  # Vite resolves --outDir from the config's root, so pass an absolute path.
  prototype_out="$PWD/apps/petrinaut-website/dist/flows-editor-prototype"
  (
    cd libs/@hashintel/petrinaut
    node ../../../node_modules/vite/bin/vite.js build --config flows-editor-prototype/vite.config.ts --base /flows-editor-prototype/ --outDir "$prototype_out" --emptyOutDir --minify false
  )
  test -f "$prototype_out/index.html"
fi
