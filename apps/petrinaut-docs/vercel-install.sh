#!/usr/bin/env bash

set -euo pipefail

echo "Changing dir to root"
cd ../..

echo "updating certificates"
yum update ca-certificates -y

echo "installing mise"
./.config/mise/install.sh
eval "$(mise activate bash --shims)"

# The build graph is `astro build` <- `sync:bundle` <- `doc:architecture`, which
# is Node throughout, and `.yarnrc.yml` sets `enableScripts: false`, so no
# dependency compiles during install. That leaves out the Rust toolchain, wasm
# target, wasm-pack, binaryen, java, protoc and redocly that the other Vercel
# apps in this repo install.
#
# `d2` renders the architecture diagrams. Without it `canRenderDiagrams` in the
# generator returns false and the bundle omits every diagram, exiting 0, so
# dropping `d2` here loses all 44 SVGs without failing the build.
echo "Installing prerequisites"
mise install --locked node npm:turbo ubi:terrastruct/d2

echo "Installing yarn dependencies"
LEFTHOOK=0 yarn install --immutable
