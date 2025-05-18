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
    # Exclude any crates that are not the current crate, this is required due to a limitation of llvm-cov, which doesn't allow
    # for testing the current crate. Any dependency (that is part of the workspace) will be covered as well, tanking coverage.
    # This is obviously not what's intended in 99% of the cases, as we want to test the coverage of the current crate only, and not it's coverage in any dependencies.
    # See https://github.com/taiki-e/cargo-llvm-cov/issues/361 for more information on this issue.
    EXCLUSIONS=$(
        cargo metadata --format-version=1 --no-deps \
            | jq -r --arg crate "$CRATE" '.packages[] | select(.name != $crate) | .manifest_path | rtrimstr("/Cargo.toml") | gsub("/"; "\\/"; "g")' \
            | paste -sd "|" -
    )

    # under CI we use LCOV
    if [[ ${CI:-0} == "1" || ${CI:-0} == "true" ]]; then
        REPORT_FLAGS="--lcov --output-path lcov.info"
    else
        REPORT_FLAGS="--html --open"
    fi

    if [[ $POWERSET == "true" || ${TEST_POWERSET:-false} == 'true' || ${TEST_POWERSET:-false} == '1' ]]; then
        CARGO_COMMAND="hack --optional-deps --feature-powerset"
        NEXTEST_ARGS=""
    else
        CARGO_COMMAND=""
        NEXTEST_ARGS="--all-features"
    fi

    cargo llvm-cov clean --workspace
    cargo $CARGO_COMMAND llvm-cov --ignore-filename-regex "$EXCLUSIONS" -p "$CRATE" --branch --no-report nextest $NEXTEST_ARGS --all-targets --cargo-profile coverage $ARGUMENTS
    cargo llvm-cov --ignore-filename-regex "$EXCLUSIONS" -p "$CRATE" --branch --no-clean $REPORT_FLAGS --doctests test --all-features --profile coverage --doc

    exit 0
fi

# Run unit tests with powerset if `TEST_POWERSET` is set to `true` or `1`
if [[ $POWERSET == "true" || ${TEST_POWERSET:-false} == 'true' || ${TEST_POWERSET:-false} == '1' ]]; then
    cargo hack --optional-deps --feature-powerset nextest run -p "$CRATE" $ARGUMENTS
    cargo test --all-features --doc -p "$CRATE"
    exit 0
fi

cargo nextest run -p "$CRATE" $ARGUMENTS
cargo test --all-features --doc -p "$CRATE"
