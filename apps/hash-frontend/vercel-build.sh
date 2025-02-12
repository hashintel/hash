#!/usr/bin/env bash

source "$HOME/.cargo/env"

set -euo pipefail

echo "Changing dir to root"
cd ../..

echo "Building frontend"
turbo build --filter='@apps/hash-frontend' --env-mode=loose
