#!/usr/bin/env just --justfile

set fallback

repo := `git rev-parse --show-toplevel`
profile := env_var_or_default('PROFILE', "dev")

[private]
default:
  @just usage

[private]
lint-toml mode:
  @echo "Lints in `.cargo/config.toml` are currently unmaintained"

[private]
test *arguments:
  cargo build -p memory --profile {{profile}}
  bash lib/execution/src/runner/python/setup.sh python3.10
  @just --justfile {{repo}}/.justfile test {{arguments}}

# Copied from `/.justfile` to ignore example scraping, which does not work properly on the Rust version we currently use.
[no-cd]
[private]
doc *arguments:
  cargo doc --workspace --all-features --no-deps {{arguments}}
