#!/usr/bin/env bash
#MISE description="Generate task-dependencies.json files from the turbo task graph"
set -euo pipefail

#USAGE arg "[arguments]..." double_dash="required" default="" help="Additional arguments that are directly passed to the task-dependencies command"

declare -a "ARGUMENTS=($usage_arguments)" # We're using "declare -a" here to allow for quoted arguments to be properly parsed as single array elements


export CARGO_TERM_PROGRESS_WHEN=never
mise exec --env dev -- cargo run --package hash-repo-chores --bin repo-chores-cli -- task-dependencies ${ARGUMENTS[@]:+"${ARGUMENTS[@]}"}
