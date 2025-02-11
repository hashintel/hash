#!/usr/bin/env bash

source "$HOME/.cargo/env"

set -euo pipefail

echo "Changing dir to root"
cd ../..

echo "Building hash.dev"
turbo build --filter='@apps/hashdotdev' --env-mode=loose
