#!/usr/bin/env bash

set -euo pipefail

source "$HOME/.cargo/env"

echo "Changing dir to root"
cd ../..

echo "Building hash.dev"
turbo build --filter='@apps/hashdotdev' --env-mode=loose
