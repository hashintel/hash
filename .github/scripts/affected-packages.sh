#!/usr/bin/env bash
# Prints a GitHub Actions matrix of the packages affected for the given turbo
# tasks: {"name": [...], "include": [{"name", "path", "<task>": "<reason>"}]}.
#
# `tasks` seeds the `affectedTasks` query rather than filtering it, so the
# result also carries the tasks needed to run the requested ones; only items
# with a requested name count. A task wired via `dependsOn` materializes a
# node in every package, so a package makes the matrix only for tasks it has
# a script for. Each task key holds the reason the package was selected.
set -euo pipefail

if [[ $# -eq 0 ]]; then
  echo "usage: $0 <task>..." >&2
  exit 64
fi

TASKS=$(printf '%s\n' "$@" | jq --raw-input . | jq --slurp --compact-output .)

QUERY="query { affectedTasks(base: \"HEAD^\", tasks: $TASKS) { items { name script package { name path } reason { __typename ... on TaskFileChanged { filePath } ... on TaskDependencyTaskChanged { taskName packageName } ... on TaskPackageDependencyChanged { packageName } ... on TaskGlobalFileChanged { filePath } ... on TaskGlobalDepsChanged { filePath } ... on TaskAllChanged { description } } } } }"

# `$tasks` is a jq variable, not shell.
# shellcheck disable=SC2016
turbo query "$QUERY" | jq --compact-output --argjson tasks "$TASKS" '
  def why: .reason
    | if .filePath then "\(.__typename): \(.filePath)"
      elif .taskName then "\(.__typename): \(.packageName)#\(.taskName)"
      elif .packageName then "\(.__typename): \(.packageName)"
      else "\(.__typename): \(.description // "")"
      end;
  [.data.affectedTasks.items[]
    | select((.name | IN($tasks[])) and .script != null and .package.name != "//")
    | { task: .name, name: .package.name, path: .package.path, why: why }]
  | group_by(.name)
  | map({ name: .[0].name, path: .[0].path } + (map({ (.task): .why }) | add))
  | { name: [.[].name], include: . }'
