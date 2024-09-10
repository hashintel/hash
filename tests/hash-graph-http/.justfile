#!/usr/bin/env just --justfile

set fallback

repo := `git rev-parse --show-toplevel`
profile := env_var_or_default('PROFILE', "dev")

[private]
default:
  @just usage

[private]
test-integration *arguments:
  @just yarn httpyac send --all {{repo}}/apps/hash-graph/libs/api/tests/friendship.http
  @just yarn graph:reset-database
  @just yarn httpyac send --all {{repo}}/apps/hash-graph/libs/api/tests/circular-links.http
  @just yarn graph:reset-database
  @just yarn httpyac send --all {{repo}}/apps/hash-graph/libs/api/tests/ambiguous.http
  @just yarn graph:reset-database
