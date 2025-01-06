#!/usr/bin/env bash

# shellcheck disable=SC1090
source ~/.bashrc

set -euo pipefail

echo "Changing dir to root"
cd ../..

echo "Building hash.design"
turbo build --filter='@apps/hashdotdesign' --env-mode=loose
