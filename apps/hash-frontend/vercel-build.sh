#!/usr/bin/env bash

cat ~/.bashrc

set -euo pipefail


source "$HOME/.cargo/env"
eval "$(mise activate bash --shims)"

echo "FRONTEND_URL: $FRONTEND_URL"
mise exec bash -- bash -c 'echo $FRONTEND_URL'

echo "Changing dir to root"
cd ../..

echo "Building frontend"
turbo build --filter='@apps/hash-frontend' --env-mode=loose
