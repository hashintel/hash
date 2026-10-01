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

# Controller prototype branch only: the prototype page ships beside the site
# at /controller-prototype/, and vercel.json sends the site root there.
echo "Building the controller prototype page"
# Vite resolves --outDir from the config's root, so pass an absolute path.
prototype_out="$PWD/apps/petrinaut-website/dist/controller-prototype"
(
  cd libs/@hashintel/petrinaut
  node ../../../node_modules/vite/bin/vite.js build --config controller-prototype/vite.config.ts --base /controller-prototype/ --outDir "$prototype_out" --emptyOutDir --minify false
)
test -f "$prototype_out/index.html"
