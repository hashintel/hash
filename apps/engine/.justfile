#!/usr/bin/env just --justfile

set fallback

repo := `git rev-parse --show-toplevel`
profile := env_var_or_default('PROFILE', "dev")

[private]
@default:
  just usage

# Copied from `/.justfile` to ignore the `lint-toml` job.
[private]
clippy *arguments:
  @just install-cargo-hack
  @just in-pr cargo clippy --profile {{profile}} --workspace --all-features --all-targets --no-deps {{arguments}}
  @just not-in-pr cargo hack --workspace --optional-deps --feature-powerset clippy --profile {{profile}} --all-targets --no-deps {{arguments}}

[private]
test *arguments:
  cargo build -p memory --profile {{profile}}
  bash lib/execution/src/runner/python/setup.sh python3.10
  @just --justfile {{repo}}/.justfile test {{arguments}}

# Copied from `/.justfile` to ignore example scaping, which does not work properly on the Rust version we currently use.
[no-cd]
doc *arguments:
  cargo doc --workspace --all-features --no-deps {{arguments}}
