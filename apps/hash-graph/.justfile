#!/usr/bin/env just --justfile

set fallback
set dotenv-load

repo := `git rev-parse --show-toplevel`
profile := env_var_or_default('PROFILE', "dev")
test-env-flags := "--cfg hash_graph_test_environment"

export HASH_GRAPH_PG_DATABASE := env_var('HASH_GRAPH_PG_DEV_DATABASE')

[private]
default:
  @just usage

# Runs the Graph API and accompanying services
run *arguments:
  cargo run --profile {{profile}} --bin hash-graph -- {{arguments}}


# Generates the OpenAPI client for the Graph REST API
generate-openapi-client:
  just run server --write-openapi-spec
  just yarn workspace @local/hash-graph-client-generator generate
  just yarn workspace @local/hash-graph-client prettier --write .
  just yarn workspace @local/hash-graph-client fix:eslint

[private]
test *arguments:
  @RUSTFLAGS="{{ test-env-flags }}" just --justfile {{repo}}/.justfile test {{arguments}}
  RUSTFLAGS="{{ test-env-flags }}" cargo test -p graph-benches --benches --profile {{profile}} {{arguments}}
  @just yarn httpyac send --all {{repo}}/apps/hash-graph/tests/rest-test.http
  @RUSTFLAGS="{{ test-env-flags }}" just generate-openapi-client

[private]
coverage *arguments:
  RUSTFLAGS="{{ test-env-flags }}" cargo llvm-cov --workspace --all-features --all-targets {{arguments}}

[private]
bench *arguments:
  @RUSTFLAGS="{{ test-env-flags }}" just --justfile {{repo}}/.justfile bench {{arguments}}

[private]
miri *arguments:
  @echo 'miri is disabled for `hash-graph`'
