#!/usr/bin/env just --justfile

set fallback

repo := `git rev-parse --show-toplevel`
profile := env_var_or_default('PROFILE', "dev")
test-env-flags := "--cfg hash_graph_test_environment"

[private]
default:
  @just usage

# Runs the Graph API and accompanying services
run *arguments:
  cargo run --profile {{profile}} --bin hash-graph -- {{arguments}}


# Generates the OpenAPI specifications and the clients
generate-openapi-specs:
  cargo run --bin hash-graph -- server --write-openapi-specs
  just yarn codegen --filter @local/hash-graph-client-python
  just yarn codegen --filter @local/hash-graph-sdk-python

[private]
test *arguments:
  just test-unit {{arguments}}
  just test-integration {{arguments}}

[private]
test-unit *arguments:
  @just install-cargo-nextest

  cargo nextest run --workspace --all-features --cargo-profile {{profile}} --lib --bins {{arguments}}
  cargo test --profile {{profile}} --workspace --all-features --doc

  @RUSTFLAGS="{{ test-env-flags }}" just generate-openapi-specs
  git --no-pager diff --exit-code --color openapi

[private]
test-integration *arguments:
  @just install-cargo-nextest

  @RUSTFLAGS="{{ test-env-flags }}" cargo nextest run --workspace --all-features --test '*' --cargo-profile {{profile}} {{arguments}}
  @RUSTFLAGS="{{ test-env-flags }}" cargo test --workspace --all-features --bench '*' --profile {{profile}} {{arguments}}
  @just yarn httpyac send --all {{repo}}/apps/hash-graph/tests/friendship.http
  @just yarn httpyac send --all {{repo}}/apps/hash-graph/tests/circular-links.http

[private]
bench *arguments:
  @RUSTFLAGS="{{ test-env-flags }}" just --justfile {{repo}}/.justfile bench {{arguments}}
