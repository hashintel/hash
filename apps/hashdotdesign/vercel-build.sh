#!/usr/bin/env bash

set -euo pipefail

source "$HOME/.cargo/env"
eval "$(mise activate bash --shims)"

echo "Changing dir to root"
cd ../..

echo "Building hash.design"
turbo build --filter='@apps/hashdotdesign' --env-mode=loose
