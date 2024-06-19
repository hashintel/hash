#!/usr/bin/env bash

# shellcheck disable=SC1090
source ~/.bashrc

set -euo pipefail

echo "Changing dir to root"
cd ../..

echo "Building frontend"
turbo build --filter='@apps/hash-frontend' --env-mode=loose
