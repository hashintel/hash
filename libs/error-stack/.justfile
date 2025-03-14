#!/usr/bin/env just --justfile

set fallback

[private]
default:
  @just usage

cargo-hack-groups := '--group-features eyre,hooks --group-features anyhow,serde --group-features futures,unstable'
profile := env_var_or_default('PROFILE', "dev")
repo := `git rev-parse --show-toplevel`

[private]
clippy *arguments:
  @CLIPPY_CONF_DIR={{repo}} just in-pr cargo clippy --profile {{profile}} --all-features --all-targets --no-deps {{arguments}}
  @CLIPPY_CONF_DIR={{repo}} just not-in-pr cargo hack --optional-deps --feature-powerset {{cargo-hack-groups}} --ignore-unknown-features clippy --profile {{profile}} --all-targets --no-deps {{arguments}}

[private]
test *arguments:
  RUST_BACKTRACE=1 cargo nextest run --all-features --all-targets {{arguments}}
  RUST_BACKTRACE=1 cargo nextest run --no-default-features --all-targets {{arguments}}
  RUST_BACKTRACE=1 cargo test --all-features --doc {{arguments}}

[private]
coverage *arguments:
  RUST_BACKTRACE=1 cargo llvm-cov nextest --workspace --all-features --all-targets --cargo-profile coverage {{arguments}}
  RUST_BACKTRACE=1 cargo llvm-cov --workspace --all-features --profile coverage --doc {{arguments}}

# Snapshot Tests
# ==============
#
# Several features make use of snapshots for acceptance/integration tests, these are files
# with expected output for a specific input.
# We use insta for tests https://github.com/mitsuhiko/insta and expect-test https://docs.rs/expect-test/latest/expect_test/ for doc tests.
# expect-test enables us to directly include the snapshot in documentation, while insta provides a more complete feature-set.
#
# You should invoke this task whenever you change `test_debug`, a file which includes a doctest with `expect_test`, or change the formatting of a `Report`.
#
# Reviewing Tests
# ---------------
#
# To review snapshots generated by insta install `cargo-insta` (https://github.com/mitsuhiko/insta) and invoke `cargo insta review`,
# you will be led through all changes one-by-one and need to compare them to see if they are what you expected the outcome to be.
#
# To review snapshots generated by expect-test use gits diffing capabilities.

# Runs the test suite and asks to update the snapshots if they don't match.
update-snapshots:
  @INSTA_FORCE_PASS=1 INSTA_UPDATE=new UPDATE_EXPECT=1 just test
  @cargo insta review
