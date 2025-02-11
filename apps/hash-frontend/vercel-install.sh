#!/usr/bin/env bash

set -euo pipefail

echo "Changing dir to root"
cd ../..

echo "updating certificates"
yum update ca-certificates -y

echo "Installing Rust"
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --default-toolchain none --profile minimal
source "$HOME/.cargo/env"
rustup show

echo "installing mise"
yum install -y yum-utils
yum-config-manager --add-repo https://mise.jdx.dev/rpm/mise.repo
yum install -y mise

echo "installing cargo-binstall"
curl -L --proto '=https' --tlsv1.2 -sSf https://raw.githubusercontent.com/cargo-bins/cargo-binstall/main/install-from-binstall-release.sh | sh

echo "installing tools"
mise install

echo "Producing pruned repo"
cp -R patches out/
turbo prune --scope='@apps/hash-frontend'

echo "Deleting contents of non-pruned dir to save space"
git ls-files -z | xargs -0 rm -f
git ls-tree --name-only -d -r -z HEAD | sort -rz | xargs -0 rm -rf

echo "Moving pruned repo back to root"
mv out/* .
rm out -r

# Install the pruned dependencies
echo "Installing yarn dependencies"
LEFTHOOK=0 yarn install --immutable
