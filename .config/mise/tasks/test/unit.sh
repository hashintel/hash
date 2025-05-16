#!/usr/bin/env bash
#MISE description="Run unit tests"
set -euo pipefail

#USAGE flag "--coverage" negate="--no-coverage" default="false" help="Run unit tests with coverage, also reads `$TEST_COVERAGE`"
#USAGE flag "--powerset" negate="--no-powerset" default="false" help="Run unit tests with powerset, also reads `$TEST_POWERSET`"
#USAGE arg "<package>" help="The package to run unit tests for"
#USAGE arg "[arguments]..." double_dash="required" default="" help="Additional arguments to pass to the test runner"

PACKAGE=$usage_package
COVERAGE=$usage_coverage
POWERSET=$usage_powerset
ARGUMENTS=$usage_arguments

# Check if the package argument starts with `@rust/` if that isn't the case exit out
if [[ $PACKAGE != "@rust/"* ]]; then
    echo "Error: Only rust crates are supported for now"
    exit 1
fi

# Remove the package namespace from the package to get the crate name
CRATE=${PACKAGE#*@rust/}

# Run coverage instead of unit tests if `TEST_COVERAGE` is set to `true` or `1`
if [[ $COVERAGE == "true" || ${TEST_COVERAGE:-false} == 'true' || ${TEST_COVERAGE:-false} == '1' ]]; then
    EXCLUSIONS=$(
        cargo metadata --format-version=1 --no-deps \
            | jq -r --arg crate "$CRATE" '.packages[] | select(.name != $crate) | .manifest_path | rtrimstr("/Cargo.toml") | gsub("/"; "\\/"; "g")' \
            | paste -sd "|" -
    )

    # under CI we use LCOV
    if [[ ${CI:-0} == "1" || ${CI:-0} == "true" ]]; then
        RENDER="--lcov --output-path lcov.info"
    else
        RENDER="--html --open"
    fi

    cargo llvm-cov clean --workspace
    cargo llvm-cov --ignore-filename-regex "$EXCLUSIONS" -p "$CRATE" --branch --no-report nextest --all-features --all-targets --cargo-profile coverage $ARGUMENTS
    cargo llvm-cov --ignore-filename-regex "$EXCLUSIONS" -p "$CRATE" --branch --no-clean $RENDER --doctests test --all-features --profile coverage --doc

    exit 0
fi

# Run unit tests with powerset if `TEST_POWERSET` is set to `true` or `1`
if [[ $POWERSET == "true" || ${TEST_POWERSET:-false} == 'true' || ${TEST_POWERSET:-false} == '1' ]]; then
    cargo hack --optional-deps --feature-powerset nextest run -p "$CRATE" $ARGUMENTS
    cargo test --all-features --doc -p "$CRATE"
    exit 0
fi

LOGFILE=$(mktemp)
trap 'rm -f "$LOGFILE"' EXIT

cargo test --all-features --doc -p "$CRATE" >"$LOGFILE" 2>&1 &
DOC_PID=$!

cargo nextest run -p "$CRATE" $ARGUMENTS

# replay what’s buffered so far
cat "$LOGFILE"

# now stream any new doc-test output until it completes
tail -n 0 -f "$LOGFILE" &
TAIL_PID=$!

# wait for the doc-tests to finish, then kill the tail
wait $DOC_PID
kill $TAIL_PID 2>/dev/null || true
