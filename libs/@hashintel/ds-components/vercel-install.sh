#!/usr/bin/env bash

set -euo pipefail

echo "Changing dir to root"
cd ../../..

echo "updating certificates"
yum update ca-certificates -y

echo "installing mise"
./.config/mise/install.sh
eval "$(mise activate bash --shims)"

# The ladle build is Node throughout — `ladle build` <- `codegen` <- the
# `ds-helpers` build — and `.yarnrc.yml` sets `enableScripts: false`, so nothing
# compiles during install. That leaves out the Rust toolchain, wasm-pack,
# binaryen, java, protoc and redocly the other Vercel apps here install; turbo
# loads the Cargo workspace only for a selection that contains a crate.
#
# turbo comes from the pin rather than the build image: the root `turbo.json`
# declares future flags that only the pinned version accepts.
echo "Installing prerequisites"
mise install --locked node npm:turbo

echo "Installing yarn dependencies"
LEFTHOOK=0 yarn install --immutable
