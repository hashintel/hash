#!/usr/bin/env bash

echo "Changing dir to root"
cd ../..

echo "installing mise"
yum install -y yum-utils
yum-config-manager --add-repo https://mise.jdx.dev/rpm/mise.repo
yum install -y mise

echo "Installing prerequisites"
yum install -y jq

echo "Installing turbo"
npm install -g "turbo@$(jq -r '.devDependencies.turbo' < package.json)"

echo "Enable corepack"
corepack enable

echo "Installing Rust"
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --default-toolchain none --profile minimal
source "$HOME/.cargo/env"
rustup toolchain install --profile minimal

echo "Installing yarn dependencies"
LEFTHOOK=0 yarn install --immutable
