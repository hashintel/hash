#!/usr/bin/env bash

# Installs the mise binary to /usr/local/bin from its GitHub release,
# verified against the release's SHASUMS256.txt.

set -euo pipefail

# renovate: datasource=github-releases depName=jdx/mise
MISE_VERSION=2026.7.14

case "$(uname -m)" in
  x86_64) arch=x64 ;;
  aarch64 | arm64) arch=arm64 ;;
  *)
    echo "unsupported architecture: $(uname -m)" >&2
    exit 1
    ;;
esac

tarball="mise-v${MISE_VERSION}-linux-${arch}.tar.gz"

cd "$(mktemp -d)"
curl -fsSL -O "https://github.com/jdx/mise/releases/download/v${MISE_VERSION}/${tarball}"
curl -fsSL "https://github.com/jdx/mise/releases/download/v${MISE_VERSION}/SHASUMS256.txt" | grep " \./${tarball}$" | sha256sum -c -
tar --no-same-owner --strip-components=2 -C /usr/local/bin -xzf "${tarball}" mise/bin/mise
rm "${tarball}"
