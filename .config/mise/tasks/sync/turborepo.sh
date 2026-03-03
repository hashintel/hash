#!/usr/bin/env bash
#MISE description="Generate package.json files from Cargo.toml metadata"
set -euo pipefail

#USAGE arg "[arguments]..." double_dash="required" default="" help="Additional arguments that are directly passed to the sync-turborepo command"

declare -a "ARGUMENTS=($usage_arguments)" # We're using "declare -a" here to allow for quoted arguments to be properly parsed as single array elements


cargo run --package hash-repo-chores --bin repo-chores-cli -- sync-turborepo ${ARGUMENTS[@]:+"${ARGUMENTS[@]}"}
