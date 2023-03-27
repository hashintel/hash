#!/usr/bin/env just --justfile

set fallback
set dotenv-load

repo := `git rev-parse --show-toplevel`
profile := env_var_or_default('PROFILE', "dev")

export HASH_GRAPH_PG_DATABASE := env_var('HASH_GRAPH_PG_DEV_DATABASE')
export DOCKER_BUILDKIT := "1"

[private]
@default:
  just usage

# Runs the Graph API and accompanying services
run *arguments:
  cargo run --profile {{profile}} --bin hash-graph -- {{arguments}}

# Spins up the deployment environment
deployment-up *arguments:
  @just yarn external-services up postgres type-fetcher --build --wait
  @just yarn external-services up graph-migrate {{arguments}}

# Tears down the deployment environment
deployment-down *arguments:
  @just yarn external-services down {{arguments}}

# Generates the OpenAPI client for the Graph REST API
generate-openapi-client:
  @just deployment-up graph --wait
  just yarn workspace @local/hash-graph-client-generator generate
  just yarn workspace @local/hash-graph-client prettier --write .
  just yarn workspace @local/hash-graph-client fix:eslint
  @just deployment-down

[private]
test *arguments:
  @just deployment-up
  @just --justfile {{repo}}/.justfile test {{arguments}}
  @just deployment-up graph --wait
  just yarn httpyac send --all {{repo}}/apps/hash-graph/tests/rest-test.http {{arguments}}
  just generate-openapi-client
  @just deployment-down

[private]
coverage *arguments:
  @just deployment-up
  cargo llvm-cov --workspace --all-features --all-targets {{arguments}}
  @just deployment-down

[private]
bench *arguments:
  @just deployment-up
  @just --justfile {{repo}}/.justfile bench {{arguments}}
  @just deployment-down
