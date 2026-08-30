#!/usr/bin/env bash
# Prints the given package plus every package reachable through its package
# and task graphs, one per line, for use as `turbo prune` scopes.
#
# `turbo prune` follows the package graph only, while task dependencies
# (`dependsOn: ["pkg#task"]`) cross it — including on packages the package
# graph pulls in, so the closure is a fixpoint over both graphs. Requires
# `turbo` and `yq`.
#
# The closure is resolved before anything is printed: a failing query exits
# without output, so a caller substituting the result into `turbo prune`
# passes no scopes at all rather than a partial list.
set -euo pipefail

if [[ $# -ne 1 ]]; then
  echo "usage: $0 <package>" >&2
  exit 64
fi
PACKAGE="$1"

QUERY='query { packages { items { name allDependencies { items { name } } tasks { items { allDependencies { items { package { name } } } } } } } }'

# One "<package>\t<dependency>" line per package- and task-graph edge.
# `$n` is a yq variable, not shell.
# shellcheck disable=SC2016
EDGES=$(
  turbo query "$QUERY" \
    | yq -p json '.data.packages.items[] | .name as $n | ((.allDependencies.items[].name, .tasks.items[].allDependencies.items[].package.name) | $n + "\t" + .)'
)

awk -F'\t' -v start="$PACKAGE" '
  { edges[$1] = edges[$1] "\t" $2 }
  END {
    queue[1] = start; seen[start] = 1; head = 1; tail = 1
    while (head <= tail) {
      n = split(edges[queue[head]], deps, "\t")
      for (i = 1; i <= n; i++)
        if (deps[i] != "" && !(deps[i] in seen)) { seen[deps[i]] = 1; queue[++tail] = deps[i] }
      head++
    }
    for (p in seen) if (p != "//") print p
  }' <<<"$EDGES" | sort
