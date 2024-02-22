#!/usr/bin/env bash

set -euo pipefail

touch ~/.bashrc

# shellcheck disable=SC2016
echo 'export PATH=/vercel/.local/bin:/usr/local/python/bin/:$PATH' >> ~/.bashrc

# shellcheck disable=SC1090
source ~/.bashrc

echo "Changing dir to root"
cd ../..

echo "updating certificates"
yum update ca-certificates -y

echo "Installing prerequisites"
yum install -y wget tar gzip jq

echo "Installing eget"
curl https://zyedidia.github.io/eget.sh | sh

# Setup TurboRepo and get a pruned src folder and lockfile

echo "Installing turbo"
yarn global add "turbo@$(jq -r '.devDependencies.turbo' < package.json)"

# TODO: investigate why producing a pruned repo results in a broken Vercel build
#   update: Probably due to missing `patches/` folder, needs investigation

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
