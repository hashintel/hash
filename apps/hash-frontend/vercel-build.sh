#!/usr/bin/env bash

set -euo pipefail

source "$HOME/.cargo/env"

echo "Changing dir to root"
cd ../..

echo "Building frontend"
turbo build --filter='@apps/hash-frontend' --env-mode=loose
