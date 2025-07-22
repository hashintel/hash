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
mise install node npm:turbo java biome npm:@redocly/cli cargo-binstall cargo:wasm-pack cargo:wasm-opt protoc yq
echo "Installing Rust toolchain: $(yq '.toolchain.channel' rust-toolchain.toml)"
mise use --global rust[profile=minimal]@$(yq '.toolchain.channel' rust-toolchain.toml)
echo "Rust installation completed. Checking versions:"
mise list rust
rustc --version
cargo --version

echo "Installing yarn dependencies"
LEFTHOOK=0 yarn install --immutable
