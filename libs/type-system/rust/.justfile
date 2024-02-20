#!/usr/bin/env just --justfile

set fallback
set dotenv-load

cargo-profile := env_var_or_default('PROFILE', "dev")

[private]
@default:
  echo "Usage: just <recipe>"
  just --list --unsorted
  echo "For further information, run 'just --help'"


install-tool tool version:
  `{{tool}} --version | grep -q "{{version}}" || cargo install "{{tool}}" --version "{{version}}" --locked --force`

[private]
cargo command *arguments:
  cargo {{command}} --workspace --all-features {{arguments}}

[private]
cargo-hack command *arguments:
  @cargo hack --workspace --feature-powerset {{command}} {{arguments}}


# Builds all configured targets of the workspace
build:
  @just build-host
  @just build-wasm

# Builds the host targets of the workspace
[private]
build-host *arguments:
  @just cargo build --profile {{cargo-profile}} {{arguments}}

# Builds the wasm targets of the workspace
[private]
build-wasm *arguments: (install-tool "wasm-pack" "0.12.1")
  # TODO: add profile
  # TODO: consider moving away from wasm-pack and using wasm-bindgen directly so we can use weak-refs
  #       https://github.com/iotaledger/identity.rs/pull/694
  @node --loader ts-node/esm "../scripts/build-wasm.ts"


[private]
rustfmt *arguments:
  cargo fmt --all {{arguments}}
# Runs auto-formatter on the type system crate
format: rustfmt

# Runs linters on the type system package
lint: (rustfmt '--check') (clippy '-- -Dwarnings')
  @RUSTDOCFLAGS="-Zunstable-options --check" just doc

[private]
clippy *arguments:
  @just cargo-hack clippy --profile {{cargo-profile}} --no-deps --all-targets {{arguments}}


# Runs tests on the workspace
test:
  @just cargo-hack nextest run --cargo-profile {{cargo-profile}}
  @just cargo test --profile {{cargo-profile}} --doc


# Creates the documentation for the workspace
doc:
  @just cargo doc --no-deps
