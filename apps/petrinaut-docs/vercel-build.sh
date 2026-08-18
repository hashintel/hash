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
rm -f .env

# Run through Turborepo rather than `yarn workspace ... build`: the package
# script alone skips `sync:bundle`, and would build whatever content happened to
# be on disk.
echo "Building Petrinaut architecture docs"
turbo build --filter='@apps/petrinaut-docs' --env-mode=loose
