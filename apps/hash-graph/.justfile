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


[private]
test *arguments:
  just test-unit {{arguments}}
  just test-integration {{arguments}}

[private]
test-unit *arguments:
  @just run server --write-openapi-specs
  git --no-pager diff --exit-code --color openapi

[private]
test-integration *arguments:
  @just yarn httpyac send --all {{repo}}/apps/hash-graph/tests/friendship.http
  @just yarn graph:reset-database
  @just yarn httpyac send --all {{repo}}/apps/hash-graph/tests/circular-links.http
  @just yarn graph:reset-database
