#!/usr/bin/env bash
# Usage: verify-jar.sh <storage-dir> <version>
#
# Checks `<storage-dir>/<version>.jar` against the SHA-256 that `checksums.txt` pins for that version.
set -euo pipefail

storage_dir=$1
jar="$2.jar"
checksums="${BASH_SOURCE[0]%/*}/checksums.txt"

if ! pin=$(grep -E "^[0-9a-f]{64}  ${jar//./\\.}\$" "$checksums"); then
  echo "::error::No SHA-256 is pinned for the OpenAPI Generator jar $jar in .github/actions/restore-openapi-generator/checksums.txt"
  exit 1
fi

cd "$storage_dir"
if ! sha256sum --check --quiet <<<"$pin"; then
  echo "::error::$storage_dir/$jar has SHA-256 $(sha256sum "$jar" | cut -d ' ' -f 1), expected ${pin%% *}"
  exit 1
fi
