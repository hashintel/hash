#!/usr/bin/env bash
#MISE description="Run unit tests"
set -euo pipefail

#USAGE flag "--coverage" negate="--no-coverage" default="false" help="Run unit tests with coverage, also reads `$TEST_COVERAGE`"
#USAGE flag "--test-strategy <strategy>" default="all" help="The test strategy to use" {
#USAGE          choices "all" "extremes" "powerset"
#USAGE }
#USAGE arg "<package>" help="The package to run unit tests for"
#USAGE arg "[arguments]..." double_dash="required" default="" help="Additional arguments to pass to the test runner"

PACKAGE=$usage_package
COVERAGE=$usage_coverage
STRATEGY=$usage_test_strategy
ARGUMENTS=$usage_arguments

# Check if the package argument starts with `@rust/` if that isn't the case exit out
if [[ $PACKAGE != "@rust/"* ]]; then
    echo "Error: Only rust crates are supported for now"
    exit 1
fi

# Remove the package namespace from the package to get the crate name
CRATE=${PACKAGE#*@rust/}

declare -a COMMON_ARGUMENTS
COMMON_ARGUMENTS+=("-p" "$CRATE")

declare -a HACK_ARGUMENTS
HACK_ARGUMENTS+=("${COMMON_ARGUMENTS[@]}")

declare -a NEXTEST_ARGUMENTS
NEXTEST_ARGUMENTS+=("${COMMON_ARGUMENTS[@]}")

declare -a LLVM_COV_ARGUMENTS
LLVM_COV_ARGUMENTS+=("${COMMON_ARGUMENTS[@]}")

case $STRATEGY in
    "all")
        NEXTEST_ARGUMENTS+=("--all-features")
        ;;
    "extremes")
        # find the features for this crate, so that we can enable all
        FEATURES=$(cargo metadata --format-version=1 --no-deps | jq -r --arg crate "$CRATE" '.packages[] | select(.name == $crate) | .features | keys | join(",")')

        HACK_ARGUMENTS+=("--feature-powerset" "--depth=1" "--group-features" "$FEATURES")
        ;;
    "powerset")
        HACK_ARGUMENTS+=("--optional-deps" "--feature-powerset")
        ;;
    *)
        echo "Error: Invalid strategy '$STRATEGY'"
        exit 1
        ;;
esac

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

    LLVM_COV_ARGUMENTS+=("--ignore-filename-regex" "$EXCLUSIONS" "--branch")

    declare -a LLVM_COV_REPORT_ARGUMENTS

    # under CI we use LCOV
    if [[ ${CI:-0} == "1" || ${CI:-0} == "true" ]]; then
        LLVM_COV_REPORT_ARGUMENTS+=("--lcov" "--output-path" "lcov.info")
    else
        LLVM_COV_REPORT_ARGUMENTS+=("--html" "--open")
    fi

    cargo llvm-cov clean --workspace
    cargo hack "${HACK_ARGUMENTS[@]}" llvm-cov "${LLVM_COV_ARGUMENTS[@]}" --no-report nextest "${NEXTEST_ARGUMENTS[@]}" --cargo-profile coverage $ARGUMENTS
    cargo llvm-cov "${LLVM_COV_ARGUMENTS[@]}" "${LLVM_COV_REPORT_ARGUMENTS[@]}" --no-clean --doctests test "${COMMON_ARGUMENTS[@]}" --all-features --profile coverage --doc

    exit 0
fi

cargo hack "${HACK_ARGUMENTS[@]}" nextest run "${NEXTEST_ARGUMENTS[@]}" $ARGUMENTS
cargo test "${COMMON_ARGUMENTS[@]}" --all-features --doc
