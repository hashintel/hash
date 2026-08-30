#!/usr/bin/env bash
# Prints the given package plus every package reachable through its task
# graph, one per line, for use as `turbo prune` scopes.
#
# `turbo prune` follows the package graph only, while task dependencies
# (`dependsOn: ["pkg#task"]`) cross it — pruning with just the package drops
# the packages behind those edges. Requires `turbo` and `yq`.
#
# The closure is resolved before anything is printed: a failing query exits
# without output, so a caller substituting the result into `turbo prune`
# fails loudly instead of pruning with a partial scope.
set -euo pipefail

PACKAGE="$1"

QUERY='query { packages { items { name tasks { items { allDependencies { items { package { name } } } } } } } }'

CLOSURE=$(
  turbo query "$QUERY" \
    | yq -p json ".data.packages.items[] | select(.name == \"$PACKAGE\") | .tasks.items[].allDependencies.items[].package.name"
)

echo "$PACKAGE"
{ grep -Fvx -e '//' -e "$PACKAGE" <<<"$CLOSURE" || true; } | sort -u
