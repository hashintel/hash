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
yum install -y wget tar gzip

echo "Installing eget"
curl https://zyedidia.github.io/eget.sh | sh

# Install Python and Poetry

### Python is not needed, currently, but this can be used to install it if needed again
#echo "Installing python"
#mkdir tmp
#cd tmp
#
#../eget indygreg/python-build-standalone -t 20230116 -a 3.11 -a x86_64-unknown-linux-gnu-install_only --download-only
#tar -axf cpython-* -C /usr/local
#
#cd ..
#rm -r tmp
#
#echo "Installing pipx and poetry"
#python3.11 -m pip install pipx
#python3.11 -m pipx install poetry

# Setup TurboRepo and get a pruned src folder and lockfile

echo "Installing turbo"
yarn global add turbo

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
