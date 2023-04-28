#!/usr/bin/env bash

set -euo pipefail

# Setup TurboRepo and get a pruned src folder and lockfile

echo "Installing turbo"
yarn global add turbo

# TODO: investigate why producing a pruned repo results in a broken Vercel build

#echo "Producing pruned repo"
#turbo prune --scope='@apps/hash-frontend'
#
#echo "Deleting contents of non-pruned dir to save space"
#git ls-files -z | xargs -0 rm -f
#git ls-tree --name-only -d -r -z HEAD | sort -rz | xargs -0 rm -rf
#
#echo "Moving pruned repo back to root"
#mv out/* .
#rm out -r

# Install the pruned dependencies

echo "Installing yarn dependencies"
HUSKY=0 yarn install --frozen-lockfile --prefer-offline --force --build-from-source
