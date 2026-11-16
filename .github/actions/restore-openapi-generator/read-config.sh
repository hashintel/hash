#!/usr/bin/env bash
# Usage: read-config.sh <openapitools.json>
#
# Prints the pinned generator version, its cache key and the absolute `storageDir`, empty when the
# config sets none, as `GITHUB_OUTPUT` lines.
set -euo pipefail

config=$1
version=$(yq -r '.["generator-cli"].version' "$config")
storage_dir=$(yq -r '.["generator-cli"].storageDir // ""' "$config")

echo "version=$version"
echo "key=openapi-generator-cli-$version"
echo "storage-dir=${storage_dir/#\~/$HOME}"
