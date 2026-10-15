#!/usr/bin/env bash
set -euo pipefail

readonly CANDIDATES=(
    /usr/share/dotnet
    /usr/share/swift
    /usr/lib/jvm
    /usr/local/.ghcup
    /usr/local/lib/android
    /usr/local/share/powershell
)

prior_gib=$(($(df --output=avail --block-size=1K / | tail -n 1 | tr -d ' ') / 1024 / 1024))

empty=$(mktemp -d)

for dir in "${CANDIDATES[@]}"; do
    if [[ -d $dir ]]; then
        echo "Deleting $dir"
        # rsync --delete is 10-100x faster than rm -rf for directories with many small files
        (sudo rsync -a --delete "$empty/" "$dir/" && sudo rmdir "$dir") &
    fi
done
wait

rmdir "$empty"

available_gib=$(($(df --output=avail --block-size=1K / | tail -n 1 | tr -d ' ') / 1024 / 1024))
if ((available_gib < REQUIRED_FREE_GIB)); then
    echo "::warning::$available_gib GiB free after the cleanup, below the $REQUIRED_FREE_GIB GiB this job needs"
fi

echo "Prior free space: $prior_gib GiB"
echo "Available free space: $available_gib GiB"
echo "Freed: $((available_gib - prior_gib)) GiB"
