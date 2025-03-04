#!/usr/bin/env bash

set -euo pipefail

source "$HOME/.cargo/env"
eval "$(mise activate bash --shims)"

echo "Changing dir to root"
cd ../..

echo "Building frontend"
turbo build --filter='@apps/hash-frontend' --env-mode=loose
