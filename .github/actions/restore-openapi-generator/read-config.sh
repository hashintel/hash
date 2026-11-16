#!/usr/bin/env bash
# Usage: read-config.sh <openapitools.json>
#
# Prints the cache key for the pinned generator version and the absolute `storageDir`, empty when
# the config sets none, as `GITHUB_OUTPUT` lines.
set -euo pipefail

config=$1
storage_dir=$(yq -r '.["generator-cli"].storageDir // ""' "$config")

echo "key=openapi-generator-cli-$(yq -r '.["generator-cli"].version' "$config")"
echo "storage-dir=${storage_dir/#\~/$HOME}"
