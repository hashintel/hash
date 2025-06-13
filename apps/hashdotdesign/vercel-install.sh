#!/usr/bin/env bash

set -euo pipefail

echo "Changing dir to root"
cd ../..

echo "installing mise"
yum install -y yum-utils
yum-config-manager --add-repo https://mise.jdx.dev/rpm/mise.repo
yum install -y mise
eval "$(mise activate bash --shims)"

echo "Installing prerequisites"
mise install node npm:turbo java biome npm:@redocly/cli cargo-binstall cargo:wasm-pack cargo:wasm-opt protoc
mise use --global yq
mise use --global rust[profile=minimal]@$(yq '.toolchain.channel' rust-toolchain.toml)

echo "Installing yarn dependencies"
LEFTHOOK=0 yarn install --immutable
