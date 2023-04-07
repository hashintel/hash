#!/usr/bin/env just --justfile

set fallback
set dotenv-load

repo := `git rev-parse --show-toplevel`
profile := env_var_or_default('PROFILE', "dev")

export HASH_GRAPH_PG_DATABASE := env_var('HASH_GRAPH_PG_DEV_DATABASE')
export DOCKER_BUILDKIT := "1"

[private]
default:
  @just usage

# Runs the Graph API and accompanying services
run *arguments:
  cargo run --profile {{profile}} --bin hash-graph -- {{arguments}}

[private]
docker-build:
  @just yarn external-services build graph
  @just in-ci docker builder prune --force

# Spins up the deployment environment
deployment-up *arguments: docker-build
  @just yarn external-services up postgres type-fetcher --wait
  @just yarn external-services up graph-migrate {{arguments}}

# Tears down the deployment environment
deployment-down *arguments:
  @just yarn external-services down {{arguments}}

[private]
test *arguments:
  @just deployment-up
  @just --justfile {{repo}}/.justfile test {{arguments}}
  cargo test -p graph-benches --benches --profile {{profile}} {{arguments}}
  @just deployment-up graph --wait
  @just yarn httpyac send --all {{repo}}/apps/hash-graph/tests/rest-test.http
  @just deployment-down
  @just generate-openapi-client

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

[private]
miri *arguments:
  @echo 'miri is disabled for `hash-graph`'

# Generates the OpenAPI client for the Graph REST API
[private]
generate-openapi-client-shared:
  @just yarn workspace @local/hash-graph-client-generator generate
  @just yarn workspace @local/hash-graph-client prettier --write .
  @just yarn workspace @local/hash-graph-client fix:eslint

[private]
generate-openapi-client:
  #!/usr/bin/env bash
  set -euo pipefail

  just run server --openapi-only &

  # When the script exits, clean-up and kill the server by searching for running processes with commands containing the
  # `--openapi-only` flag
  trap 'kill $(pgrep -f -- '\''--openapi-only'\'')' EXIT

  retries=10

  while ! just run server --healthcheck --openapi-only 2> /dev/null; do
    if [ $retries -eq 0 ]; then
      echo "Max retries reached, exiting"
      exit 1
    fi

    retries=$((retries-1))
    sleep 1
  done

  just generate-openapi-client-shared


# Runs the Graph through docker and generates the OpenAPI client
docker-generate-openapi-client: docker-build
  #!/usr/bin/env bash
  set -euo pipefail

  SERVER_CONTAINER_ID=$(docker run -p 4000:4000 -d hash-graph server --openapi-only --api-host=0.0.0.0)

  trap 'docker rm -f $SERVER_CONTAINER_ID' EXIT INT QUIT

  retries=10

  while ! curl http://localhost:4000/api-doc/openapi.json -sq > /dev/null; do
    if [ $retries -eq 0 ]; then
      echo "Max retries reached, exiting"
      exit 1
    fi

    retries=$((retries-1))
    sleep 1
  done

  just generate-openapi-client-shared
