#!/usr/bin/env bash

echo "Changing dir to root"
cd ../..

echo "Installing Rust"
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --default-toolchain none --profile minimal
source "$HOME/.cargo/env"

echo "Installing yarn dependencies"
HUSKY=0 yarn install --frozen-lockfile --prefer-offline --force --build-from-source
