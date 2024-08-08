#!/usr/bin/env bash

set -euo pipefail

echo "Changing dir to root"
cd ../..

echo "Building hash.design"
turbo build-storybook --filter='@apps/hashdotdesign' --env-mode=loose
