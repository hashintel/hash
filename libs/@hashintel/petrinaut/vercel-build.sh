#!/usr/bin/env bash

set -euo pipefail

source "$HOME/.cargo/env"
eval "$(mise activate bash --shims)"

echo "Changing dir to root"
cd ../../..

# TODO: Mise is picking up `.env` files. We need to overhaul our approach for
#   environment variables. To avoid this in the meantime, we'll remove the
#   `.env` file.
# See: https://linear.app/hash/issue/H-3213/use-consistent-naming-schema-for-environment-variables
# See: https://linear.app/hash/issue/H-4202/sort-out-which-environment-variables-are-defined-where
rm .env

echo "Building Petrinaut"
turbo build --filter='@hashintel/petrinaut' --env-mode=loose
