#!/usr/bin/env just --justfile

set fallback

repo := `git rev-parse --show-toplevel`
profile := env_var_or_default('PROFILE', "dev")

[private]
default:
  @just usage

# Runs the Graph API and accompanying services
run *arguments:
  cargo run --profile {{profile}} --bin hash-graph -- {{arguments}}


# Generates the OpenAPI specifications and the clients
generate-openapi-specs:
  just run server --write-openapi-specs

[private]
test *arguments:
  just test-unit {{arguments}}
  just test-integration {{arguments}}

[private]
test-unit *arguments:
  @just install-cargo-nextest

  cargo nextest run --workspace --all-features --cargo-profile {{profile}} --lib --bins {{arguments}}
  cargo test --profile {{profile}} --workspace --all-features --doc

  @just run server --write-openapi-specs
  git --no-pager diff --exit-code --color openapi

[private]
test-integration *arguments:
  @just install-cargo-nextest

  @cargo test --workspace --all-features --bench '*' --profile {{profile}} {{arguments}}
  @just yarn httpyac send --all {{repo}}/apps/hash-graph/tests/friendship.http
  @just yarn httpyac send --all {{repo}}/apps/hash-graph/tests/circular-links.http

[private]
bench *arguments:
  @just --justfile {{repo}}/.justfile bench {{arguments}}
