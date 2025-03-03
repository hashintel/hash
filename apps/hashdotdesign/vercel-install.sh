#!/usr/bin/env bash

set -euo pipefail

echo "Changing dir to root"
cd ../..

echo "installing mise"
yum install -y yum-utils
yum-config-manager --add-repo https://mise.jdx.dev/rpm/mise.repo
yum install -y mise

export MISE_VERBOSE=1
echo "Installing prerequisites"
mise install node npm:turbo java
mise use --global yq
mise ls
eval "$(mise activate bash)"
mise ls
mise which yq
mise exec yq -- yq '.toolchain.channel' rust-toolchain.toml
yq '.toolchain.channel' rust-toolchain.toml
mise use --global rust[profile=minimal]@$(yq '.toolchain.channel' rust-toolchain.toml)

echo "Installing yarn dependencies"
LEFTHOOK=0 yarn install --immutable
