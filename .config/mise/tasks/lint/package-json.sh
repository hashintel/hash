#!/usr/bin/env bash
#MISE description="Check that package.json files are sorted"
set -euo pipefail

#USAGE arg "[arguments]..." double_dash="required" default="" help="Additional arguments that are directly passed to the sort-package-json command"

declare -a "ARGUMENTS=($usage_arguments)" # We're using "declare -a" here to allow for quoted arguments to be properly parsed as single array elements


cargo run --package hash-repo-chores --bin repo-chores-cli -- sort-package-json --check ${ARGUMENTS[@]:+"${ARGUMENTS[@]}"}
