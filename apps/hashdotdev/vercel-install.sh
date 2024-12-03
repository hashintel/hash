#!/usr/bin/env bash

echo "Changing dir to root"
cd ../..

echo "Installing prerequisites"
yum install -y jq

echo "Installing turbo"
npm install -g "turbo@$(jq -r '.devDependencies.turbo' < package.json)"

echo "Enable corepack"
corepack enable

echo "Installing Rust"
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --default-toolchain none --profile minimal
source "$HOME/.cargo/env"
# `rustup show` uses `rust-toolchain.toml` to install the correct toolchain.
for _ in {1..5}; do rustup show && break || sleep 5; done

echo "Installing yarn dependencies"
HUSKY=0 yarn install --immutable
