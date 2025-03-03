#!/usr/bin/env bash

set -euo pipefail

echo "Changing dir to root"
cd ../..

echo "installing mise"
yum install -y yum-utils
yum-config-manager --add-repo https://mise.jdx.dev/rpm/mise.repo
yum install -y mise

echo "Installing prerequisites"
mise install node npm:turbo
mise use --global yq
mise ls
eval "$(mise activate bash)"
mise ls
mise which protoc
mise use --global rust[profile=minimal]@$(mise exec yq -- yq '.toolchain.channel' rust-toolchain.toml)

echo "Installing yarn dependencies"
LEFTHOOK=0 yarn install --immutable
