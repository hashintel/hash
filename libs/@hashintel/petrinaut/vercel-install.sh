#!/usr/bin/env bash

set -euo pipefail

echo "Changing dir to root"
cd ../../..

echo "updating certificates"
yum update ca-certificates -y

echo "installing mise"
yum install -y yum-utils
yum-config-manager --add-repo https://mise.jdx.dev/rpm/mise.repo
yum install -y mise
eval "$(mise activate bash --shims)"

echo "Installing Rust toolchain: $(yq '.toolchain.channel' rust-toolchain.toml)"
mise install yq
export RUSTUP_AUTO_INSTALL=0
mise use --global rust[profile=minimal]@$(yq '.toolchain.channel' rust-toolchain.toml)

echo "Installing prerequisites"
mise install node npm:turbo java biome npm:@redocly/cli cargo-binstall cargo:wasm-pack cargo:wasm-opt protoc

echo "Rust installation completed. Checking versions:"
mise list rust
rustc --version
cargo --version


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
LEFTHOOK=0 yarn install --immutable
