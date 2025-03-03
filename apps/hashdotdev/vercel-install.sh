#!/usr/bin/env bash

echo "Changing dir to root"
cd ../..

echo "installing mise"
yum install -y yum-utils
yum-config-manager --add-repo https://mise.jdx.dev/rpm/mise.repo
yum install -y mise

echo "Installing prerequisites"
mise install node npm:turbo rust[profile=minimal]

# echo "Installing Rust"
# curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --default-toolchain none --profile minimal
# source "$HOME/.cargo/env"
# # `rustup show` uses `rust-toolchain.toml` to install the correct toolchain.
# for _ in {1..5}; do rustup show && break || sleep 5; done

echo "Installing yarn dependencies"
LEFTHOOK=0 yarn install --immutable
