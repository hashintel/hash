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

[private]
test-integration *arguments:
  @just install-cargo-nextest

  @RUSTFLAGS="{{ test-env-flags }}" cargo nextest run --workspace --all-features --test '*' --cargo-profile {{profile}} {{arguments}}
  @RUSTFLAGS="{{ test-env-flags }}" cargo test --workspace --all-features --bench '*' --cargo-profile {{profile}} {{arguments}}
  @just yarn httpyac send --all {{repo}}/apps/hash-graph/tests/friendship.http
  @just yarn httpyac send --all {{repo}}/apps/hash-graph/tests/circular-links.http

[private]
coverage *arguments:
  just coverage-unit {{arguments}}
  just coverage-integration {{arguments}}

[private]
coverage-unit *arguments:
  @just install-cargo-nextest
  @just install-llvm-cov

  RUSTFLAGS="{{ test-env-flags }}" cargo llvm-cov nextest --workspace --all-features --lib --bins --cargo-profile {{profile}} {{arguments}}
  RUSTFLAGS="{{ test-env-flags }}" cargo llvm-cov --workspace --all-features --profile {{profile}} --doc {{arguments}}

[private]
coverage-integration *arguments:
  @just install-cargo-nextest
  @just install-llvm-cov

  @RUSTFLAGS="{{ test-env-flags }}" cargo llvm-cov nextest --workspace --all-features --test '*' {{arguments}}
  @RUSTFLAGS="{{ test-env-flags }}" cargo llvm-cov --workspace --all-features --bench '*' --profile {{profile}} {{arguments}}

[private]
test-or-coverage:
  just test-or-coverage-unit
  just test-or-coverage-integration

[private]
test-or-coverage-unit:
  #!/usr/bin/env bash
  set -eo pipefail
  if [[ "$TEST_COVERAGE" = 'true' || "$TEST_COVERAGE" = '1' ]]; then
    just coverage-unit --lcov --output-path lcov.info
    @RUSTFLAGS="{{ test-env-flags }}" just generate-openapi-specs
  else
    just test-unit --no-fail-fast
  fi

[private]
test-or-coverage-integration:
  #!/usr/bin/env bash
  set -eo pipefail
  if [[ "$TEST_COVERAGE" = 'true' || "$TEST_COVERAGE" = '1' ]]; then
    just coverage-integration --lcov --output-path lcov.info
  else
    just test-integration --no-fail-fast
  fi

[private]
bench *arguments:
  @RUSTFLAGS="{{ test-env-flags }}" just --justfile {{repo}}/.justfile bench {{arguments}}
