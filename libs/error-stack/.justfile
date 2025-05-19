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
