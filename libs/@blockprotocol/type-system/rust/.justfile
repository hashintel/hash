#!/usr/bin/env just --justfile

set fallback
set dotenv-load

cargo-profile := env_var_or_default('PROFILE', "dev")

[private]
@default:
  echo "Usage: just <recipe>"
  just --list --unsorted
  echo "For further information, run 'just --help'"

# Builds the wasm targets of the workspace
[private]
build-wasm *arguments:
  @just install-wasm-pack
  wasm-pack build --target web --out-name type-system --scope blockprotocol --release .
  rm pkg/package.json
