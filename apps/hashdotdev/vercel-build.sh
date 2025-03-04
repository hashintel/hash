#!/usr/bin/env bash

set -euo pipefail

source "$HOME/.cargo/env"
eval "$(mise activate bash --shims)"

echo "Changing dir to root"
cd ../..

echo "Building hash.dev"
turbo build --filter='@apps/hashdotdev' --env-mode=loose
